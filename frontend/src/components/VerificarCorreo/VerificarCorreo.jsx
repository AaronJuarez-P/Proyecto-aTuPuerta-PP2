import { useEffect, useRef, useState } from 'react'
import { reenviarCodigo, verificarCorreo } from '../../api/auth'
import '../Comunes/Comunes.css'
import './VerificarCorreo.css'

const LARGO_CODIGO = 6

// El backend contesta el mismo 401 ("Email o contraseña incorrectos") si para ese correo
// ya no hay un registro esperando el código que si la contraseña no es la de ese
// registro: así no delata qué correos están a medio registrar. En este paso la persona
// no escribió ninguna de las dos cosas, y ese texto no le diría qué hacer.
const REGISTRO_YA_NO_PENDIENTE =
  'Este registro ya no está pendiente. Si ya verificaste tu correo, iniciá sesión; si no, registrate de nuevo.'

const mensajeDe = (error) => (error.codigo === 401 ? REGISTRO_YA_NO_PENDIENTE : error.message)

const enMinutos = (cantidad) => `${cantidad} ${cantidad === 1 ? 'minuto' : 'minutos'}`

// Segundo paso del registro: ingresar el código de 6 dígitos que llegó por correo.
//
// No tiene ruta propia. Se muestra dentro de Registro (recién registrado) y de Login
// (alguien que se registró, cerró la pestaña y volvió): las dos pantallas ya tienen en
// memoria la contraseña, que el backend pide junto con el código, y así no viaja por la
// URL ni queda en el historial.
//
// envio es lo que contestó el backend al mandar el último código ({ minutos_vigencia,
// segundos_reenvio, codigo_mock? }), o null si no se sabe cuándo salió (desde el login).
// alVerificar inicia la sesión y navega. Si falla, la cuenta ya quedó creada: el botón
// pasa a reintentar solo ese paso, sin volver a mandar el código.
export default function VerificarCorreo({ email, contrasena, envio = null, textoVolver, alVerificar, alVolver }) {
  const [ultimoEnvio, setUltimoEnvio] = useState(envio)
  const [codigo, setCodigo] = useState('')
  const [aviso, setAviso] = useState(null)
  const [verificando, setVerificando] = useState(false)
  const [reenviando, setReenviando] = useState(false)
  const [cuentaCreada, setCuentaCreada] = useState(false)
  const campoCodigo = useRef(null)

  // La espera para pedir otro código se guarda como el momento en que termina, no como
  // segundos que se van restando: el navegador frena los temporizadores de las pestañas
  // que no se ven, y justo acá la persona se va a otra a mirar el correo.
  const [esperaHasta, setEsperaHasta] = useState(() => Date.now() + (envio?.segundos_reenvio ?? 0) * 1000)
  const [ahora, setAhora] = useState(() => Date.now())

  const segundosDeEspera = Math.max(0, Math.ceil((esperaHasta - ahora) / 1000))
  const enEspera = segundosDeEspera > 0
  const ocupado = verificando || reenviando

  useEffect(() => {
    if (!enEspera) {
      return undefined
    }

    const reloj = setInterval(() => setAhora(Date.now()), 500)
    return () => clearInterval(reloj)
  }, [enEspera])

  function empezarEspera(segundos) {
    const desde = Date.now()
    setAhora(desde)
    setEsperaHasta(desde + segundos * 1000)
  }

  async function confirmar(evento) {
    evento.preventDefault()
    setAviso(null)

    if (!cuentaCreada) {
      if (codigo.length !== LARGO_CODIGO) {
        setAviso({ tipo: 'error', texto: `El código tiene ${LARGO_CODIGO} dígitos.` })
        return
      }

      setVerificando(true)

      try {
        await verificarCorreo({ email, contrasena, codigo })
      } catch (errorCodigo) {
        setAviso({ tipo: 'error', texto: mensajeDe(errorCodigo) })
        setVerificando(false)
        // Queda seleccionado: lo próximo que se tipee lo reemplaza
        campoCodigo.current?.select()
        return
      }

      // Desde acá la cuenta existe. Si lo que sigue falla no hay que volver a mandar el
      // código (ya no hay ningún registro pendiente, daría un 401): solo falta entrar.
      setCuentaCreada(true)
    }

    setVerificando(true)

    try {
      await alVerificar()
    } catch (errorIngreso) {
      setAviso({
        tipo: 'error',
        texto: `Tu cuenta ya está creada, pero no pudimos iniciar sesión. ${errorIngreso.message}`,
      })
      setVerificando(false)
    }
  }

  async function pedirOtroCodigo() {
    setAviso(null)
    setReenviando(true)

    try {
      const nuevo = await reenviarCodigo({ email, contrasena })

      // El código anterior dejó de servir: lo que estaba escrito ya no vale
      setUltimoEnvio(nuevo)
      setCodigo('')
      setAviso({ tipo: 'ok', texto: nuevo.mensaje })
      empezarEspera(nuevo.segundos_reenvio ?? 0)
      campoCodigo.current?.focus()
    } catch (errorReenvio) {
      const segundosRestantes = errorReenvio.datos?.segundos_restantes

      // 429 con segundos_restantes: todavía no pasó la espera entre un código y el
      // siguiente. No es un error de la persona, y el backend dice cuánto falta: la
      // cuenta regresiva se pone en hora con eso.
      if (segundosRestantes > 0) {
        empezarEspera(segundosRestantes)
        setAviso({ tipo: 'info', texto: errorReenvio.message })
      } else {
        setAviso({ tipo: 'error', texto: mensajeDe(errorReenvio) })
      }
    } finally {
      setReenviando(false)
    }
  }

  if (cuentaCreada) {
    return (
      <form className="verificar-correo formulario" onSubmit={confirmar}>
        <p className="aviso-form aviso-form-ok">Verificamos tu correo y tu cuenta ya está creada.</p>

        {aviso && <p className={`aviso-form aviso-form-${aviso.tipo}`} role="alert">{aviso.texto}</p>}

        <button type="submit" className="boton boton-primario boton-bloque" disabled={verificando}>
          {verificando ? 'Ingresando…' : 'Iniciar sesión'}
        </button>
      </form>
    )
  }

  let textoReenviar = 'Reenviar código'

  if (reenviando) {
    textoReenviar = 'Enviando…'
  } else if (enEspera) {
    textoReenviar = `Reenviar código en ${segundosDeEspera} s`
  }

  return (
    <form className="verificar-correo formulario" onSubmit={confirmar}>
      <p className="verificar-texto">
        {ultimoEnvio ? (
          <>
            Te mandamos un código de {LARGO_CODIGO} dígitos a <strong>{email}</strong>. Vale
            por {enMinutos(ultimoEnvio.minutos_vigencia)}.
          </>
        ) : (
          <>
            Ingresá el código de {LARGO_CODIGO} dígitos que te mandamos a <strong>{email}</strong>.
            Si no lo tenés a mano o ya venció, pedí uno nuevo.
          </>
        )}
      </p>

      {ultimoEnvio?.codigo_mock && (
        <div className="verificar-prueba">
          <p>
            <strong>Modo de prueba.</strong> El backend no está mandando correos
            (<code>EMAIL_MODO</code>), así que tu código aparece acá:
          </p>
          <p className="verificar-prueba-codigo">{ultimoEnvio.codigo_mock}</p>
        </div>
      )}

      <div className="campo-form verificar-codigo">
        <label htmlFor="codigo-verificacion">Código de verificación</label>
        <input
          id="codigo-verificacion"
          ref={campoCodigo}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={codigo}
          // Sin maxLength a propósito: recortaría un código pegado con espacios
          // ("123 456") antes de que este filtro se los saque
          onChange={(evento) => setCodigo(evento.target.value.replace(/\D/g, '').slice(0, LARGO_CODIGO))}
          autoFocus
        />
        {ultimoEnvio && !ultimoEnvio.codigo_mock && (
          <small>Si no lo ves en la bandeja de entrada, revisá el correo no deseado.</small>
        )}
      </div>

      {aviso && (
        <p className={`aviso-form aviso-form-${aviso.tipo}`} role={aviso.tipo === 'error' ? 'alert' : 'status'}>
          {aviso.texto}
        </p>
      )}

      <button type="submit" className="boton boton-primario boton-bloque" disabled={ocupado}>
        {verificando ? 'Verificando…' : 'Verificar correo'}
      </button>

      <div className="verificar-acciones">
        <button type="button" className="verificar-enlace" onClick={pedirOtroCodigo} disabled={ocupado || enEspera}>
          {textoReenviar}
        </button>
        <button type="button" className="verificar-enlace verificar-enlace-suave" onClick={alVolver} disabled={ocupado}>
          {textoVolver}
        </button>
      </div>
    </form>
  )
}
