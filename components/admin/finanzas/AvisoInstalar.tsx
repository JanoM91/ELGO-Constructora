'use client'

/**
 * Invitación a agregar Finanzas a la pantalla de inicio del celular (docs/61).
 *
 * Solo aparece cuando hace falta: en un teléfono o tableta, abierta desde el
 * navegador (no desde el icono ya instalado) y mientras la persona no la haya
 * cerrado. Explica el paso en palabras del sistema de cada quien:
 *
 *   - iPhone/iPad: Safari no ofrece instalar solo; hay que ir a Compartir →
 *     «Agregar a pantalla de inicio». Aquí se dice exactamente eso.
 *   - Android/Chrome: si el navegador ya avisó que se puede instalar
 *     (`beforeinstallprompt`), el botón «Instalar» abre el cuadro del sistema;
 *     si no, se explica el camino por el menú.
 *
 * Cerrarla se recuerda 30 días en el teléfono (localStorage). Desde el icono
 * instalado (`display-mode: standalone`) nunca se muestra.
 */
import React, { useEffect, useState } from 'react'
import { Icono } from './comun'

const CLAVE = 'fz-instalar-cerrado'
const DIAS_CERRADO = 30

type Plataforma = 'ios' | 'android' | 'otra'
type Instalador = { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

function plataforma(): Plataforma {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'otra'
}

function yaInstalada(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return Boolean(nav.standalone) || window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches
}

function cerradaHacePoco(): boolean {
  try {
    const v = Number(localStorage.getItem(CLAVE))
    return Number.isFinite(v) && v > 0 && Date.now() - v < DIAS_CERRADO * 86_400_000
  } catch {
    return false
  }
}

export default function AvisoInstalar({ nombre }: { nombre: string }) {
  const [ver, setVer] = useState<Plataforma | null>(null)
  const [instalador, setInstalador] = useState<Instalador | null>(null)

  useEffect(() => {
    const esTactil = window.matchMedia('(pointer: coarse)').matches
    const p = plataforma()
    if (!esTactil || p === 'otra' || yaInstalada() || cerradaHacePoco()) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- solo se sabe en el navegador, después de montar
    setVer(p)
    const alPoderInstalar = (e: Event) => {
      e.preventDefault()
      setInstalador(e as unknown as Instalador)
    }
    const alInstalar = () => setVer(null)
    window.addEventListener('beforeinstallprompt', alPoderInstalar)
    window.addEventListener('appinstalled', alInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', alPoderInstalar)
      window.removeEventListener('appinstalled', alInstalar)
    }
  }, [])

  if (!ver) return null

  function cerrar() {
    try {
      localStorage.setItem(CLAVE, String(Date.now()))
    } catch {
      /* sin almacenamiento (modo privado): solo se oculta esta vez */
    }
    setVer(null)
  }
  async function instalar() {
    if (!instalador) return
    await instalador.prompt()
    const r = await instalador.userChoice
    if (r.outcome === 'accepted') setVer(null)
  }

  return (
    <div className="fz-instalar" role="note">
      <span className="fz-instalar__ico" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- icono estático de public/ */}
        <img src="/finanzas/icon-192.png" alt="" width={40} height={40} />
      </span>
      <span className="fz-instalar__texto">
        <b>Agrega {nombre} a tu pantalla de inicio</b>
        {ver === 'ios' ? (
          <span>Toca <b>Compartir</b> <Icono n="compartir" chico /> y luego «Agregar a pantalla de inicio».</span>
        ) : instalador ? (
          <span>Abre como app, sin barra del navegador.</span>
        ) : (
          <span>En Chrome: menú <b>⋮</b> → «Instalar app» o «Agregar a pantalla principal».</span>
        )}
      </span>
      {instalador && <button type="button" className="fz-btn fz-btn--teal fz-btn--chico" onClick={instalar}>Instalar</button>}
      <button type="button" className="fz-icono-btn" aria-label="Cerrar aviso" onClick={cerrar}><Icono n="x" chico /></button>
    </div>
  )
}
