// Adaptador de la pasarela de pago (semana 6, CU07).
//
// Es el UNICO archivo del proyecto que sabe que existe MercadoPago. El resto del
// backend habla contra esta interfaz, asi que cambiar de pasarela (o de version del
// SDK) se hace tocando solo aca.
//
// A diferencia de auditoria.service.js, este service NO recibe una conexion: no
// escribe en la base, solo habla con la API externa.
//
// Dos modos, segun MP_MODO en el .env:
//   mock    -> no llama a MercadoPago. Devuelve una preferencia falsa y una URL local.
//              Sirve para probar y demostrar el flujo completo sin ngrok ni credenciales.
//   sandbox -> usa el SDK real con credenciales de prueba (token TEST-...).
//
// OJO con la documentacion vieja que anda dando vueltas: el SDK v1 usaba
// mercadopago.configure({ sandbox: true }) y mercadopago.payment.create(). Eso ya no
// existe. En el SDK actual no hay flag de sandbox: el entorno lo define usar un token
// TEST- en lugar de uno de produccion.

const { MercadoPagoConfig, Preference, Payment, WebhookSignatureValidator } = require('mercadopago');

const MONEDA = 'ARS';

// Ventana de tolerancia para el timestamp de la firma del webhook. Evita que alguien
// capture una notificacion valida y la reenvie horas despues.
const TOLERANCIA_FIRMA_SEGUNDOS = 300;

const esModoMock = () => (process.env.MP_MODO || 'mock').toLowerCase() !== 'sandbox';

// Sin barra final, para poder concatenar rutas sin terminar con doble barra
const urlPublica = () => (process.env.URL_PUBLICA || 'http://localhost:4000').replace(/\/+$/, '');

// El cliente se arma la primera vez que se lo necesita y no al importar el modulo:
// asi el servidor arranca igual en modo mock aunque no haya token configurado.
let clienteMp = null;

const obtenerCliente = () => {
    if (!clienteMp) {
        if (!process.env.MP_ACCESS_TOKEN) {
            throw new Error('Falta MP_ACCESS_TOKEN en el .env para usar MP_MODO=sandbox');
        }

        clienteMp = new MercadoPagoConfig({
            accessToken: process.env.MP_ACCESS_TOKEN,
            options: { timeout: 5000 }
        });
    }

    return clienteMp;
};

// Crea la preferencia de Checkout Pro y devuelve a donde hay que mandar al cliente.
//
// items: filas de items_pedido con el nombre del producto ya resuelto
// Devuelve { referenciaExterna, urlPago }
const crearPreferencia = async ({ pedidoId, items }) => {
    if (esModoMock()) {
        return {
            referenciaExterna: `MOCK-${pedidoId}-${Date.now()}`,
            urlPago: `${urlPublica()}/api/pagos/simular`
        };
    }

    const preferencia = new Preference(obtenerCliente());

    const respuesta = await preferencia.create({
        body: {
            items: items.map((item) => ({
                id: String(item.producto_id),
                title: item.producto_nombre,
                quantity: item.cantidad,
                unit_price: Number(item.precio_unit),
                currency_id: MONEDA
            })),
            // Es como el webhook sabe despues a que pedido corresponde el pago
            external_reference: String(pedidoId),
            notification_url: `${urlPublica()}/api/pagos/webhook`,
            back_urls: {
                success: `${urlPublica()}/api/pagos/retorno`,
                failure: `${urlPublica()}/api/pagos/retorno`,
                pending: `${urlPublica()}/api/pagos/retorno`
            }
        }
    });

    // Con credenciales de prueba hay que mandar al cliente al sandbox_init_point.
    // El init_point es el de produccion y con un token TEST- entra en loop de redirects.
    return {
        referenciaExterna: String(respuesta.id),
        urlPago: respuesta.sandbox_init_point || respuesta.init_point
    };
};

// Consulta el pago contra la API por su id.
//
// El webhook trae unicamente un id, asi que este paso no es opcional: es la unica
// forma de saber el estado y el monto reales. Creerle al body de la notificacion
// seria confiar en datos que manda quien haga el POST.
//
// Devuelve { estadoExterno, motivo, pedidoId, monto, referenciaExterna }
const consultarPago = async (pagoExternoId) => {
    const pago = await new Payment(obtenerCliente()).get({ id: pagoExternoId });

    return {
        estadoExterno: pago.status,
        motivo: pago.status_detail || null,
        pedidoId: pago.external_reference ? parseInt(pago.external_reference, 10) : null,
        monto: pago.transaction_amount,
        referenciaExterna: String(pago.id)
    };
};

// Valida la firma del webhook. Lanza si no verifica.
//
// El endpoint del webhook es publico (MercadoPago no tiene nuestro JWT), asi que esta
// firma es su UNICA autenticacion: es lo que impide que cualquiera mande una
// aprobacion falsa y se lleve un pedido sin pagarlo.
const validarFirmaWebhook = ({ xSignature, xRequestId, dataId }) => {
    if (esModoMock()) {
        return;
    }

    if (!process.env.MP_WEBHOOK_SECRET) {
        throw new Error('Falta MP_WEBHOOK_SECRET en el .env para validar los webhooks');
    }

    WebhookSignatureValidator.validate({
        xSignature,
        xRequestId,
        dataId,
        secret: process.env.MP_WEBHOOK_SECRET,
        toleranceSeconds: TOLERANCIA_FIRMA_SEGUNDOS
    });
};

module.exports = { esModoMock, crearPreferencia, consultarPago, validarFirmaWebhook };
