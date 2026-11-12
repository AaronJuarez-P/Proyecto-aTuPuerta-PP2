// Disponibilidad del repartidor (semana 8, CU19-CU20).
//
// disponible significa "puede tomar un pedido nuevo": pasa a FALSE al aceptar un
// pedido, vuelve a TRUE al entregarlo, y ademas el repartidor lo prende y apaga a mano.
//
// Igual que el resto de los servicios, las funciones reciben la CONEXION del
// controlador como primer parametro para participar de su transaccion.

// Lockea la fila del repartidor y devuelve { disponible }, o null si no existe.
//
// Tiene que ser lo PRIMERO que hace toda transaccion que toque al repartidor (aceptar,
// entregar, cambiar la disponibilidad a mano), por dos motivos:
// - Serializa las operaciones del mismo repartidor. Sin el lock, dos aceptaciones
//   simultaneas leerian las dos disponible = TRUE y se quedaria con dos pedidos.
// - Fija el orden de locks repartidores -> pagos -> pedidos -> productos. Si entregar
//   lockeara el pedido antes que el repartidor, seria el orden inverso al de aceptar y
//   las dos operaciones podrian deadlockearse.
const bloquearRepartidor = async (conexion, repartidorId) => {
    const [repartidores] = await conexion.query(
        `SELECT disponible FROM repartidores WHERE id = ? FOR UPDATE`,
        [repartidorId]
    );

    if (repartidores.length === 0) {
        return null;
    }

    return { disponible: Boolean(repartidores[0].disponible) };
};

const actualizarDisponibilidad = async (conexion, { repartidorId, disponible }) => {
    await conexion.query(
        `UPDATE repartidores SET disponible = ? WHERE id = ?`,
        [disponible, repartidorId]
    );
};

// Id del pedido que el repartidor tiene en camino, o null si no tiene ninguno.
//
// Sirve tanto con el pool como con una conexion de transaccion. Vivia como helper
// local en repartidor.controller.js hasta la semana 9, cuando registrar una ubicacion
// tambien necesito saber a que pedido asociarla.
const buscarPedidoEnCurso = async (conexion, repartidorId) => {
    const [pedidos] = await conexion.query(
        `SELECT id FROM pedidos
         WHERE repartidor_id = ? AND estado = 'en_camino'
         ORDER BY id ASC
         LIMIT 1`,
        [repartidorId]
    );

    return pedidos.length > 0 ? pedidos[0].id : null;
};

// ---------------------------------------------------------------------------
// Licencia de conducir
// ---------------------------------------------------------------------------

// El unico vehiculo que se maneja sin licencia. Es la misma excepcion que ya hacian el
// formulario de registro (patente y licencia opcionales) y maps.service.js (todo lo demas
// se rutea como vehiculo a motor). Por eso "otro" tambien lleva licencia: si no, alcanzaria
// con elegirlo para saltearse la regla.
const VEHICULO_SIN_LICENCIA = 'bicicleta';

const MENSAJE_LICENCIA = "El número de licencia tiene que ser el de tu DNI: en la Licencia Nacional de Conducir es el mismo número. Solo la bicicleta no lleva licencia";

// Devuelve el mensaje de error, o null si la licencia sirve para ese vehiculo.
//
// La ley de transito (24.449, art. 15 inc. a) dice que el numero de la licencia coincide
// con el del documento del titular. Entonces, salvo con bicicleta, la licencia tiene que
// ser igual al DNI. No prueba que la licencia exista ni que este vigente, pero descarta la
// de otra persona y cualquier texto inventado.
//
// Con bicicleta el campo queda como texto libre: la columna es NOT NULL y el front manda
// "No aplica".
//
// A diferencia de las de arriba, es una funcion pura y no recibe la conexion: el registro
// le pasa los datos del body, y el perfil, la fila de la base combinada con los cambios.
const validarLicencia = ({ tipo_vehiculo, numero_licencia, dni }) => {
    if (tipo_vehiculo === VEHICULO_SIN_LICENCIA) {
        return null;
    }

    return numero_licencia === dni ? null : MENSAJE_LICENCIA;
};

module.exports = { bloquearRepartidor, actualizarDisponibilidad, buscarPedidoEnCurso, validarLicencia };
