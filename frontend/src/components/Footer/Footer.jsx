import { Clock, Mail, MapPin, Phone } from 'lucide-react'
import Marca from '../Marca/Marca'
import './Footer.css'

const EQUIPO = ['Gonzalo Silva', 'Aarón Juárez', 'Jerónimo González Ocampo', 'Santiago Weidmann']

// El logo va al medio, con el contacto a un lado y el equipo al otro. El contacto es de
// ejemplo: el mail usa el dominio .example, reservado para ejemplos, y el teléfono es todo
// ceros. La app va a funcionar en Santa Fe y en Santo Tomé.
export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-columnas">
        <Marca variante="oscura" lema className="marca-apilada footer-marca" />

        <div className="footer-contacto">
          <h2>Contacto</h2>
          <address>
            <a href="mailto:hola@atupuerta.example"><Mail size={16} />hola@atupuerta.example</a>
            <a href="tel:+543420000000"><Phone size={16} />+54 342 000-0000</a>
            <span><MapPin size={16} />Santa Fe, Argentina</span>
            <span><Clock size={16} />Lunes a viernes, de 9 a 18 h</span>
          </address>
        </div>

        <div className="footer-equipo">
          <h2>Diseñado por</h2>
          <ul>
            {EQUIPO.map((nombre) => <li key={nombre}>{nombre}</li>)}
          </ul>
        </div>
      </div>

      <p className="footer-pie"><strong>ATuPuerta</strong> Práctica Profesionalizante 2</p>
    </footer>
  )
}
