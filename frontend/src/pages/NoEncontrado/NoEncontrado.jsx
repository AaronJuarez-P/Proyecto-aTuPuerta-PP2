import { Link } from 'react-router'
import noEncontrado from '../../assets/ilustraciones/no-encontrado.svg'
import { EstadoVacio } from '../../components/Comunes/Comunes'

export default function NoEncontrado() {
  return (
    <main className="pagina">
      <div className="pagina-angosta">
        <EstadoVacio
          ilustracion={noEncontrado}
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
