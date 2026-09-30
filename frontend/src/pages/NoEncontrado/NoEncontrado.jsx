import { Link } from 'react-router'
import { EstadoVacio } from '../../components/Comunes/Comunes'

export default function NoEncontrado() {
  return (
    <main className="pagina">
      <div className="pagina-angosta">
        <EstadoVacio
          icono="🧭"
          titulo="No encontramos esta página"
          accion={
            <Link className="boton boton-primario" to="/">
              Volver al inicio
            </Link>
          }
        >
          Puede que el link esté mal escrito o que la página ya no exista.
        </EstadoVacio>
      </div>
    </main>
  )
}
