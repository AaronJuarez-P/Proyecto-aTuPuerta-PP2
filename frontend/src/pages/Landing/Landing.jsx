import { Link } from 'react-router'
import { ArrowDown, BookOpen, Check, CircleUser, DoorOpen, MapPin, Motorbike, Repeat, Search, Shirt, ShoppingCart, Store, Wrench } from 'lucide-react'
import Marca from '../../components/Marca/Marca'
import './Landing.css'

// icon: el componente de lucide-react
const categories = [

  { icon: ShoppingCart, title: 'Supermercados', description: 'Lo que necesitás para todos los días.', color: 'super', categoria: 'Supermercado' },
  { icon: BookOpen, title: 'Librerías', description: 'Para estudiar, trabajar y crear.', color: 'books', categoria: 'Librería' },
  { icon: Wrench, title: 'Ferreterías', description: 'Todo para ese próximo proyecto.', color: 'hardware', categoria: 'Ferretería' },
  { icon: Shirt, title: 'Ropa', description: 'Tu próximo favorito, cerca de casa.', color: 'clothes', categoria: 'Indumentaria' },
]

const steps = [
  { icon: Search, title: 'Explorá comercios', description: 'Supermercados, librerías, ferreterías y tiendas de ropa en tu zona.' },
  { icon: ShoppingCart, title: 'Armá tu pedido', description: 'Seleccioná productos y confirmá la entrega a tu dirección.' },
  { icon: MapPin, title: 'Seguí tu entrega', description: 'Consultá el estado de tu pedido y el recorrido del repartidor.' },
  { icon: DoorOpen, title: 'Recibí en casa', description: 'Tus comercios de siempre, ahora a tu puerta.' },
]

const roles = [
  { icon: CircleUser, title: 'Cliente', description: 'Todo lo que necesitás, en un solo lugar.', features: ['Explorar comercios y productos', 'Seguimiento del pedido', 'Historial de compras', 'Repetir pedidos anteriores', 'Gestionar tus datos de entrega'] },
  { icon: Store, title: 'Negocio', description: 'Tu comercio, más cerca de tus clientes.', features: ['Panel de gestión de productos', 'Control de stock y precios', 'Recepción de pedidos', 'Coordinación de los envíos', 'Menor costo de intermediación'] },
  { icon: Motorbike, title: 'Repartidor', description: 'Conectá los negocios con su comunidad.', features: ['Panel de pedidos disponibles', 'Gestión de entregas asignadas', 'Rutas de entrega', 'Ubicación del destino', 'Confirmación de entrega'] },
]

export default function Landing() {
  return (
    <>
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <main id="contenido">
        <section className="landing-hero" id="inicio" aria-labelledby="hero-title">
          <div className="hero-content">
            <Marca variante="oscura" className="marca-apilada hero-marca" />
            <p className="hero-badge"><span aria-hidden="true" />Comercios locales, delivery justo</p>
            <h1 id="hero-title">Delivery justo,<br /><em>a tu puerta</em></h1>
            <p className="hero-description">Pedí de supermercados, ferreterías, librerías y más — sin el sobrecosto de las apps tradicionales.</p>
            <div className="hero-actions">
            <Link className="button button-primary" to="/comercios">
            <ShoppingCart size={18} /> Explorá los rubros</Link>
              <a className="button button-outline" href="#como-funciona">¿Cómo funciona? <ArrowDown size={18} /></a>
            </div>
          </div>
        </section>

        <div className="benefits-bar" aria-label="Propuesta de ATuPuerta">
          <div><strong>Local</strong><span>Comercios de tu barrio</span></div>
          <div><strong>4 rubros</strong><span>Más que comida</span></div>
          <div><strong><MapPin size={18} /> Seguimiento</strong><span>Tu pedido, paso a paso</span></div>
          <div><strong><Repeat size={18} /> Repetí</strong><span>Volvé a pedir tus favoritos</span></div>
        </div>

        <section className="landing-section category-section" id="comercios" aria-labelledby="categories-title">
          <p className="eyebrow">CERCA TUYO</p>
          <h2 id="categories-title">Tu barrio tiene lo que buscás</h2>
          <p className="section-description">Una plataforma para comprar en comercios de distintos rubros.</p>
          <div className="category-grid">
            {categories.map(({ icon: Icono, ...category }) => (
              <Link className={`category-card category-${category.color}`} key={category.title} to={`/comercios?categoria=${encodeURIComponent(category.categoria)}`}>
                <div className="category-banner"><Icono size={44} /></div>
                <div className="category-body"><h3>{category.title}</h3><p>{category.description}</p></div>
              </Link>
            ))}
          </div>
        </section>

        <section className="how-section" id="como-funciona" aria-labelledby="how-title">
          <div className="landing-section">
            <p className="eyebrow">ASÍ FUNCIONA</p>
            <h2 id="how-title">Simple, rápido y justo</h2>
            <div className="steps-grid">
              {steps.map(({ icon: Icono, ...step }, index) => (
                <article className="step-card" key={step.title}>
                  <div className="step-icon" aria-hidden="true"><Icono size={28} /><span>{index + 1}</span></div>
                  <h3>{step.title}</h3><p>{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="roles-section" id="para-todos" aria-labelledby="roles-title">
          <div className="landing-section">
            <p className="eyebrow">PARA TODOS</p>
            <h2 id="roles-title">Una plataforma, tres formas de conectar</h2>
            <p className="section-description">Clientes, negocios y repartidores: cada uno tiene su lugar.</p>
            <div className="roles-grid">
              {roles.map(({ icon: Icono, ...role }) => (
                <article className="role-card" key={role.title}>
                  <span className="role-icon"><Icono size={26} /></span>
                  <h3>{role.title}</h3><p>{role.description}</p>
                  <ul>{role.features.map(feature => <li key={feature}><Check size={16} />{feature}</li>)}</ul>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
