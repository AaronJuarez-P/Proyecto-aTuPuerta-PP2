import Marca from '../Marca/Marca'
import './Footer.css'

export default function Footer() {
  return (
    <footer className="site-footer">
      <Marca variante="oscura" lema className="marca-apilada footer-marca" />
      <p><strong>ATuPuerta</strong> — Práctica Profesionalizante 2</p>
      <p>Gonzalo Silva · Aarón Juárez · Jerónimo González Ocampo · Santiago Weidmann</p>
      <p className="footer-note">Comercios locales. Más cerca tuyo.</p>
    </footer>
  )
}
