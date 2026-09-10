import { useState } from 'react'
import Header from '../../components/Header/Header'
import Footer from '../../components/Footer/Footer'
import './Registro.css'

export default function Registro() {
    const [nombre, setNombre] = useState('')
    const [correo, setCorreo] = useState('')
    const [telefono, setTelefono] = useState('')
    const [contrasena, setContrasena] = useState('')
    const [confirmarContrasena, setConfirmarContrasena] = useState('')
    const [error, setError] = useState('')
    const [mensaje, setMensaje] = useState('')
    const [cargando, setCargando] = useState(false)

    function manejarRegistro(e) {
        e.preventDefault()

        setError('')
        setMensaje('')

        if (
            !nombre.trim() ||
            !correo.trim() ||
            !telefono.trim() ||
            !contrasena ||
            !confirmarContrasena
        ) {
            setError('Completá todos los campos.')
            return
        }

        if (contrasena.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres.')
            return
        }

        if (contrasena !== confirmarContrasena) {
            setError('Las contraseñas no coinciden.')
            return
        }

        setCargando(true)

        setTimeout(() => {
            const usuario = {
                id: Date.now(),
                nombre: nombre.trim(),
                correo: correo.trim(),
                telefono: telefono.trim(),
                rol: 'cliente',
            }

            localStorage.setItem('usuario', JSON.stringify(usuario))

            setCargando(false)
            setMensaje('Cuenta creada correctamente.')

            setTimeout(() => {
                window.location.href = '/'
            }, 1000)
        }, 500)
    }

    return (
        <>
            <Header />

            <main className="registro-page">
                <section className="registro-container">

                    <div className="registro-intro">
                        <p className="eyebrow">ATUPUERTA</p>

                        <h1>Creá tu cuenta</h1>

                        <p>
                            Registrate para realizar pedidos y seguirlos
                            desde un solo lugar.
                        </p>
                    </div>

                    <form
                        className="registro-form"
                        onSubmit={manejarRegistro}
                    >

                        <div className="campo">
                            <label htmlFor="nombre">
                                Nombre completo
                            </label>

                            <input
                                id="nombre"
                                type="text"
                                value={nombre}
                                onChange={(e) => setNombre(e.target.value)}
                                placeholder="Tu nombre"
                            />
                        </div>

                        <div className="campo">
                            <label htmlFor="correo">
                                Correo electrónico
                            </label>

                            <input
                                id="correo"
                                type="email"
                                value={correo}
                                onChange={(e) => setCorreo(e.target.value)}
                                placeholder="tu@email.com"
                            />
                        </div>

                        <div className="campo">
                            <label htmlFor="telefono">
                                Teléfono
                            </label>

                            <input
                                id="telefono"
                                type="tel"
                                value={telefono}
                                onChange={(e) => setTelefono(e.target.value)}
                                placeholder="Tu teléfono"
                            />
                        </div>

                        <div className="campo">
                            <label htmlFor="contrasena">
                                Contraseña
                            </label>

                            <input
                                id="contrasena"
                                type="password"
                                value={contrasena}
                                onChange={(e) => setContrasena(e.target.value)}
                                placeholder="Mínimo 6 caracteres"
                            />
                        </div>

                        <div className="campo">
                            <label htmlFor="confirmarContrasena">
                                Confirmar contraseña
                            </label>

                            <input
                                id="confirmarContrasena"
                                type="password"
                                value={confirmarContrasena}
                                onChange={(e) =>
                                    setConfirmarContrasena(e.target.value)
                                }
                                placeholder="Repetí tu contraseña"
                            />
                        </div>

                        {error && (
                            <p className="registro-error">
                                {error}
                            </p>
                        )}

                        {mensaje && (
                            <p className="registro-mensaje">
                                {mensaje}
                            </p>
                        )}

                        <button
                            type="submit"
                            className="registro-button"
                            disabled={cargando}
                        >
                            {cargando
                                ? 'Creando cuenta...'
                                : 'Crear cuenta'}
                        </button>

                        <p className="registro-login">
                            ¿Ya tenés una cuenta?
                            {' '}
                            <a href="/login">
                                Iniciá sesión
                            </a>
                        </p>

                    </form>

                </section>
            </main>

            <Footer />
        </>
    )
}