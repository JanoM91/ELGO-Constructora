/* Página de inicio pública de ELGO. Textos en lib/landing.ts. */
import Link from 'next/link'
import React from 'react'

import { landing } from '../../lib/landing'
import { site } from '../../lib/site'

/* El año del pie se recalcula una vez al día. */
export const revalidate = 86400

export default function Inicio() {
  const { contacto } = landing
  const hayContacto = Boolean(contacto.telefono || contacto.whatsapp || contacto.correo)
  const anio = new Date().getFullYear()

  return (
    <>
      <header className="lp-cab">
        <Link href="/" className="lp-marca" aria-label={`${site.brand.name}, inicio`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.svg" alt="" aria-hidden="true" width={66} height={28} />
          <span>{site.brand.name}</span>
        </Link>
        <nav className="lp-cab__nav" aria-label="Principal">
          <a href="#servicios" className="lp-cab__link">Servicios</a>
          {hayContacto && <a href="#contacto" className="lp-cab__link">Contacto</a>}
          <Link href="/admin" className="lp-btn lp-btn--chico">Acceso del equipo</Link>
        </nav>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-hero__dentro">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="lp-hero__iso" src="/logo-mark-white.png" alt="" aria-hidden="true" width={512} height={218} />
            <p className="lp-eyebrow">{landing.nombreCompleto} · {landing.ciudad}</p>
            <h1>{landing.titulo}</h1>
            <p className="lp-hero__sub">{landing.subtitulo}</p>
            <div className="lp-hero__acciones">
              {hayContacto ? (
                <a href="#contacto" className="lp-btn">Contáctanos</a>
              ) : (
                <a href="#servicios" className="lp-btn">Qué hacemos</a>
              )}
              <Link href="/admin" className="lp-btn lp-btn--borde">Acceso del equipo</Link>
            </div>
          </div>
        </section>

        <section id="servicios" className="lp-seccion">
          <p className="lp-eyebrow lp-eyebrow--cafe">Servicios</p>
          <h2>Qué hacemos</h2>
          <div className="lp-tarjetas">
            {landing.servicios.map((s, i) => (
              <article key={s.titulo} className="lp-tarjeta">
                <span className="lp-tarjeta__num">{String(i + 1).padStart(2, '0')}</span>
                <h3>{s.titulo}</h3>
                <p>{s.texto}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-seccion lp-seccion--gris" aria-labelledby="equipo">
          <div className="lp-equipo">
            <div>
              <p className="lp-eyebrow lp-eyebrow--cafe">Para el equipo de {site.brand.name}</p>
              <h2 id="equipo">Plataforma {site.brand.name}</h2>
              <p className="lp-tenue">Las herramientas internas viven en un solo lugar. Entra con tu cuenta.</p>
              <Link href="/admin" className="lp-btn">Entrar a la plataforma</Link>
            </div>
            <ul className="lp-apps">
              {landing.aplicaciones.map((a) => (
                <li key={a.nombre}>
                  <Link href={a.ruta} className="lp-app">
                    <span className="lp-app__nombre">{a.nombre}</span>
                    <span className="lp-app__texto">{a.texto}</span>
                    <span className={`lp-pill${a.disponible ? ' lp-pill--ok' : ''}`}>{a.disponible ? 'Disponible' : 'Próximamente'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {hayContacto && (
          <section id="contacto" className="lp-seccion">
            <p className="lp-eyebrow lp-eyebrow--cafe">Contacto</p>
            <h2>Hablemos de tu proyecto</h2>
            <div className="lp-contacto">
              {contacto.telefono && <a className="lp-btn lp-btn--borde-oscuro" href={`tel:${contacto.telefono.replace(/\s/g, '')}`}>Llamar · {contacto.telefono}</a>}
              {contacto.whatsapp && <a className="lp-btn" href={`https://wa.me/${contacto.whatsapp}`} rel="noopener noreferrer" target="_blank">WhatsApp</a>}
              {contacto.correo && <a className="lp-btn lp-btn--borde-oscuro" href={`mailto:${contacto.correo}`}>{contacto.correo}</a>}
            </div>
          </section>
        )}
      </main>

      <footer className="lp-pie">
        <span>© {anio} {landing.nombreCompleto}</span>
        <span>{landing.ciudad}</span>
      </footer>
    </>
  )
}
