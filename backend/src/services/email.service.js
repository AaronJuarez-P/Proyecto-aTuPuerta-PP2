// Adaptador del correo (verificacion del correo al registrarse).
//
// Es el UNICO archivo del proyecto que sabe que los correos salen con Nodemailer por
// SMTP. El resto del backend habla contra esta interfaz, asi que cambiar de proveedor
// (otro SMTP, o una API como Resend o Brevo) se hace tocando solo aca.
//
// Igual que pago.service.js, este service NO recibe una conexion: no escribe en la
// base, solo habla con el servidor de correo.
//
// Tres modos, segun EMAIL_MODO en el .env:
//   off  -> el registro no verifica el correo: crea la cuenta directo, como antes de
//           que existiera la verificacion. Sirve para cargar usuarios de prueba rapido.
//   mock -> se pide el codigo, pero no se manda ningun correo (el valor por defecto).
//           El codigo sale por la consola y viaja en la respuesta del registro como
//           codigo_mock. Alcanza para probar y demostrar el flujo completo con correos
//           inventados, sin ninguna cuenta.
//   smtp -> manda el codigo de verdad, con las variables SMTP_*.

const nodemailer = require('nodemailer');

const MODOS = ['off', 'mock', 'smtp'];

// Se lee una sola vez, al arrancar: un valor mal escrito se avisa una vez en el log y no
// en cada registro. Ante la duda queda en mock y no en off: los dos dejan de mandar
// correos, pero off ademas dejaria de pedir el codigo.
const leerModo = () => {
    const valor = (process.env.EMAIL_MODO || '').trim().toLowerCase() || 'mock';

    if (!MODOS.includes(valor)) {
        console.warn(`[email] EMAIL_MODO="${process.env.EMAIL_MODO}" no es off, mock ni smtp: queda en mock.`);
        return 'mock';
    }

    return valor;
};

const MODO = leerModo();

if (MODO === 'off') {
    console.warn("[email] EMAIL_MODO=off: el registro crea la cuenta SIN verificar el correo. Sirve para cargar usuarios de prueba, no para un despliegue.");
} else if (MODO === 'mock') {
    console.log("[email] EMAIL_MODO=mock: no se mandan correos. El código de verificación sale por esta consola y en la respuesta del registro (codigo_mock).");
}

// true si registrarse pide el codigo (mock y smtp)
const verificacionActiva = () => MODO !== 'off';

// true si los correos salen de verdad. Cuando es false, el codigo se le puede mostrar a
// quien se registra, porque no hay ninguna casilla que proteger.
const enviaCorreos = () => MODO === 'smtp';

// El transporte se arma la primera vez que se lo necesita y no al importar el modulo:
// asi el servidor arranca igual en modo mock u off aunque no haya nada de SMTP en el .env.
let transporte = null;

const obtenerTransporte = () => {
    if (!transporte) {
        const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;

        if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
            throw new Error('Faltan SMTP_HOST, SMTP_USER o SMTP_PASS en el .env para usar EMAIL_MODO=smtp');
        }

        const puerto = Number(process.env.SMTP_PORT) || 465;

        transporte = nodemailer.createTransport({
            host: SMTP_HOST,
            port: puerto,
            // 465 es TLS desde el primer byte. En 587 la conexion arranca sin cifrar y
            // Nodemailer la pasa a TLS con STARTTLS: ahi secure tiene que ser false.
            secure: puerto === 465,
            auth: { user: SMTP_USER, pass: SMTP_PASS },
            // Los valores por defecto de Nodemailer son de minutos (2 para conectar, 10
            // de inactividad). Aca hay una persona esperando la respuesta del registro:
            // si el proveedor no contesta, mejor un 503 rapido que la pantalla colgada.
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000
        });
    }

    return transporte;
};

// El correo no lleva el nombre de la persona ni ningun otro texto del formulario, a
// proposito. Todavia no se sabe si la casilla es de quien se esta registrando: si el
// correo repitiera lo que escribio, registrarse con la direccion de otro serviria para
// mandarle un texto propio desde la cuenta de ATuPuerta.
const armarCorreo = ({ codigo, minutos }) => {
    // EMAIL_CODIGO_MINUTOS puede valer 1
    const vigencia = `${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`;

    return {
        subject: `${codigo} es tu código de ATuPuerta`,
        text: [
            'Hola:',
            '',
            `Tu código para terminar de crear tu cuenta en ATuPuerta es ${codigo}`,
            '',
            `Vence en ${vigencia}. Ingresalo en la pantalla "Verificá tu correo".`,
            '',
            'Si no fuiste vos, ignorá este correo: sin el código no se crea ninguna cuenta.'
        ].join('\n'),
        html: `
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #111827;">
  <p style="margin: 0 0 4px; font-size: 13px; letter-spacing: 2px; color: #1d6a3a; font-weight: bold;">ATUPUERTA</p>
  <h1 style="margin: 0 0 16px; font-size: 22px;">Verificá tu correo</h1>
  <p style="margin: 0 0 16px; line-height: 1.5;">Tu código para terminar de crear tu cuenta es:</p>
  <p style="margin: 0 0 16px; padding: 16px; border-radius: 12px; background: #eafcf1; color: #1d6a3a; font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center;">${codigo}</p>
  <p style="margin: 0 0 16px; line-height: 1.5;">Vence en ${vigencia}. Ingresalo en la pantalla "Verificá tu correo".</p>
  <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #6b7280;">Si no fuiste vos, ignorá este correo: sin el código no se crea ninguna cuenta.</p>
</div>`.trim()
    };
};

// Manda el codigo de verificacion. No devuelve nada: si el correo no sale, tira.
//
// Es una llamada de red: quien la usa la hace FUERA de cualquier transaccion, igual que
// las de Mapbox y MercadoPago.
const enviarCodigoVerificacion = async ({ email, codigo, minutos }) => {
    if (!enviaCorreos()) {
        console.log(`[email ${MODO}] Código de verificación para ${email}: ${codigo}`);
        return;
    }

    await obtenerTransporte().sendMail({
        from: process.env.EMAIL_REMITENTE || `ATuPuerta <${process.env.SMTP_USER}>`,
        // Como objeto y no como texto: a un texto Nodemailer lo parsea como una lista de
        // direcciones con nombre, y la validacion del registro deja pasar cosas como
        // TEXTO<otra@direccion.com> o direccion(TEXTO)@dominio.com. Parseadas, el correo
        // le llegaria a esa otra direccion con TEXTO como nombre del destinatario: un
        // texto que elige quien se registra, justo lo que armarCorreo evita. Como objeto,
        // todo lo escrito es UNA sola direccion (a lo raro Nodemailer lo pone entre
        // comillas): ya no es la casilla de nadie y el servidor de correo la rechaza.
        to: { address: email },
        ...armarCorreo({ codigo, minutos })
    });
};

module.exports = { verificacionActiva, enviaCorreos, enviarCodigoVerificacion };
