import isotipo from '../../assets/marca/isotipo.svg'
import './Marca.css'

// La marca: el isotipo y el nombre, que es texto (no una imagen). La variante clara va
// sobre fondos claros (header, login) y la oscura sobre fondos oscuros (footer),
// como el logo original. El tamaño lo da el font-size de quien la usa.
export default function Marca({ variante = 'clara', lema = false, className = '' }) {
  return (
    <span className={`marca marca-${variante} ${className}`.trim()}>
      <img className="marca-isotipo" src={isotipo} alt="" width="139" height="102" />
      <span className="marca-textos">
        <span className="marca-nombre">
          <span className="marca-atu">ATu</span>
          <span className="marca-puerta">Puerta</span>
        </span>
        {lema && <span className="marca-lema">Todo lo que necesitás, en un solo lugar</span>}
      </span>
    </span>
  )
}
