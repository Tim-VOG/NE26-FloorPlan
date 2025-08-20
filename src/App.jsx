import React, { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Rect, Line, Group, Text as KonvaText, Image as KonvaImage } from 'react-konva'
import * as pdfjsLib from 'pdfjs-dist'
import { motion } from 'framer-motion'

// pdf.js worker (CDN)
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.js'

const STATUS = {
  available: { key: 'available', label: 'Disponible', color: '#10B981' },
  reserved:  { key: 'reserved',  label: 'Réservé',    color: '#F59E0B' },
  occupied:  { key: 'occupied',  label: 'Occupé',     color: '#EF4444' },
}
const uid = () => Math.random().toString(36).slice(2,9)

export default function App(){
  const [activeTool, setActiveTool] = useState('select') // select | rect | i | l | u | free
  const [booths, setBooths] = useState([])
  const [companies, setCompanies] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [pdfImage, setPdfImage] = useState(null)
  const [stageSize, setStageSize] = useState({width: 360, height: 560})
  const fileRef = useRef(null)
  const jsonRef = useRef(null)

  useEffect(()=>{
    const onResize = () => setStageSize({width: window.innerWidth, height: Math.max(560, window.innerHeight-180)})
    onResize()
    window.addEventListener('resize', onResize)
    return ()=> window.removeEventListener('resize', onResize)
  },[])

  // Import PDF -> render first page into image
  const onImportPdf = async (file) => {
    const buf = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 1 })
    const scale = Math.min(1800/viewport.width, 1200/viewport.height, 2)
    const v = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = Math.ceil(v.width)
    canvas.height = Math.ceil(v.height)
    await page.render({ canvasContext: ctx, viewport: v }).promise
    const img = new Image()
    img.src = canvas.toDataURL('image/png')
    await new Promise(res => img.onload = () => res(null))
    setPdfImage(img)
  }

  const addBooth = (shape, x, y) => {
    const b = { id: uid(), name: 'Booth ' + (booths.length+1), shape, x, y, w: 120, h: 80, status: 'available', points: [] }
    if (shape==='i'){ b.points=[0,0,120,0,120,30,0,30]; b.h=30 }
    if (shape==='l'){ b.points=[0,0,120,0,120,30,30,30,30,120,0,120]; b.w=120; b.h=120 }
    if (shape==='u'){ b.points=[0,0,120,0,120,30,90,30,90,90,30,90,30,30,0,30]; b.w=120; b.h=90 }
    setBooths(prev=>[...prev,b])
    setSelectedId(b.id)
  }

  const onStagePointerDown = (e) => {
    const pos = e.target.getStage().getPointerPosition()
    if (!pos) return
    if (activeTool==='select'){ setSelectedId(null); return }
    if (activeTool==='free'){
      const id = uid()
      const b = { id, name: 'Booth ' + (booths.length+1), shape:'free', x: pos.x, y: pos.y, w:0,h:0, status:'available', points:[pos.x,pos.y] }
      setBooths(prev=>[...prev,b])
      setSelectedId(id)
      return
    }
    addBooth(activeTool, pos.x-60, pos.y-40)
  }
  const onStagePointerMove = (e) => {
    const pos = e.target.getStage().getPointerPosition()
    if(!pos) return
    setBooths(prev => prev.map(b => {
      if(b.id!==selectedId || b.shape!=='free') return b
      return { ...b, points: [...b.points, pos.x, pos.y] }
    }))
  }

  const updateBooth = (id, patch) => setBooths(prev => prev.map(b => b.id===id ? { ...b, ...patch } : b))
  const deleteBooth = (id) => setBooths(prev => prev.filter(b => b.id!==id))

  const selected = booths.find(b=>b.id===selectedId) || null
  const colorFill = (s) => STATUS[s].color + '59' // 35% opacity
  const companyName = (id) => companies.find(c=>c.id===id)?.name || 'Non assignée'

  const exportJSON = () => {
    const plan = { booths, companies }
    const blob = new Blob([JSON.stringify(plan,null,2)], {type:'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'expo-plan.json'
    a.click()
    URL.revokeObjectURL(url)
  }
  const importJSON = async (file) => {
    const txt = await file.text()
    try {
      const plan = JSON.parse(txt)
      setBooths(plan.booths||[])
      setCompanies(plan.companies||[])
    } catch { alert('Fichier invalide') }
  }

  // Simple company adder
  const [name,setName]=useState('')
  const [website,setWebsite]=useState('')
  const [email,setEmail]=useState('')
  const [phone,setPhone]=useState('')
  const addCompany = () => {
    if(!name.trim()) return
    const id = uid()
    setCompanies(prev=>[...prev,{id,name:name.trim(),website,email,phone}])
    setName(''); setWebsite(''); setEmail(''); setPhone('')
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-[rgba(15,23,42,0.85)] backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-3 py-3 flex items-center gap-2">
          <div className="font-semibold">ExpoPlanner</div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className={activeTool==='select'?'px-3 py-1 rounded bg-white/10':'px-3 py-1 rounded bg-white/5'} onClick={()=>setActiveTool('select')}>Sélection</button>
            <button className={activeTool==='rect'?'px-3 py-1 rounded bg-white/10':'px-3 py-1 rounded bg-white/5'} onClick={()=>setActiveTool('rect')}>Rect</button>
            <button className={activeTool==='i'?'px-3 py-1 rounded bg-white/10':'px-3 py-1 rounded bg-white/5'} onClick={()=>setActiveTool('i')}>I</button>
            <button className={activeTool==='l'?'px-3 py-1 rounded bg-white/10':'px-3 py-1 rounded bg-white/5'} onClick={()=>setActiveTool('l')}>L</button>
            <button className={activeTool==='u'?'px-3 py-1 rounded bg-white/10':'px-3 py-1 rounded bg-white/5'} onClick={()=>setActiveTool('u')}>U</button>
            <button className={activeTool==='free'?'px-3 py-1 rounded bg-white/10':'px-3 py-1 rounded bg-white/5'} onClick={()=>setActiveTool('free')}>Main libre</button>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e=> e.target.files?.[0] && onImportPdf(e.target.files[0])} />
            <button className="px-3 py-1 rounded bg-white/5" onClick={()=>fileRef.current?.click()}>Importer PDF</button>
            <input ref={jsonRef} type="file" accept="application/json" className="hidden" onChange={e=> e.target.files?.[0] && importJSON(e.target.files[0])} />
            <button className="px-3 py-1 rounded bg-white/5" onClick={()=>jsonRef.current?.click()}>Importer Plan</button>
            <button className="px-3 py-1 rounded bg-white/5" onClick={exportJSON}>Sauvegarder</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 py-4 grid grid-cols-1 md:grid-cols-[1fr_320px] gap-4">
        <div className="rounded-2xl ring-1 ring-white/10 overflow-hidden">
          <Stage
            width={stageSize.width}
            height={stageSize.height}
            onPointerDown={onStagePointerDown}
            onPointerMove={onStagePointerMove}
          >
            <Layer>
              {pdfImage ? (
                <KonvaImage image={pdfImage} width={stageSize.width} height={stageSize.height} />
              ) : (
                <Group>
                  <Rect x={0} y={0} width={stageSize.width} height={stageSize.height} fill={'#0B1220'} />
                  <KonvaText text="Importez un PDF du plan pour démarrer" x={16} y={16} fill="#9CA3AF" fontSize={14} />
                </Group>
              )}
            </Layer>
            <Layer>
              {booths.map(b => (
                <Group key={b.id} x={b.x} y={b.y} draggable
                  onDragMove={e=>updateBooth(b.id,{x:e.target.x(), y:e.target.y()})}
                  onClick={()=>setSelectedId(b.id)} onTap={()=>setSelectedId(b.id)}
                  onDblClick={()=>alert(`Stand: ${b.name}\nStatut: ${b.status}\nSociété: ${companyName(b.companyId)}`)}
                  onDblTap={()=>alert(`Stand: ${b.name}\nStatut: ${b.status}\nSociété: ${companyName(b.companyId)}`)}
                >
                  {b.shape==='rect' && <Rect width={b.w} height={b.h} cornerRadius={8} fill={colorFill(b.status)} stroke={b.id===selectedId?'#fff':'rgba(255,255,255,0.5)'} />}
                  {(b.shape==='i'||b.shape==='l'||b.shape==='u') && <Line points={b.points||[]} closed fill={colorFill(b.status)} stroke={b.id===selectedId?'#fff':'rgba(255,255,255,0.5)'} />}
                  {b.shape==='free' && <Line points={b.points||[]} stroke={'#fff'} strokeWidth={8} lineCap="round" lineJoin="round" opacity={0.9} />}
                  <KonvaText text={b.name} fill="#E5E7EB" x={8} y={8} fontSize={12} />
                </Group>
              ))}
            </Layer>
          </Stage>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl p-3 ring-1 ring-white/10">
            <h3 className="font-semibold mb-2">Disponibilités</h3>
            <div className="flex gap-3 text-sm">
              {Object.values(STATUS).map(s => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded" style={{background:s.color}}></span>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-xl p-3 ring-1 ring-white/10 space-y-2">
            <h3 className="font-semibold">Sociétés</h3>
            <div className="text-xs text-slate-400">{companies.length} sociétés</div>
            <div className="grid grid-cols-1 gap-2">
              {companies.map(c => (
                <div key={c.id} className="p-2 rounded border border-white/10">
                  <div className="text-sm font-medium">{c.name}</div>
                  {c.website && <div className="text-xs text-slate-400 break-all">{c.website}</div>}
                </div>
              ))}
            </div>
            <div className="h-px bg-white/10 my-2"></div>
            <input className="w-full px-2 py-1 rounded bg-white/10" placeholder="Nom" value={name} onChange={e=>setName(e.target.value)} />
            <input className="w-full px-2 py-1 rounded bg-white/10" placeholder="Site web" value={website} onChange={e=>setWebsite(e.target.value)} />
            <input className="w-full px-2 py-1 rounded bg-white/10" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
            <input className="w-full px-2 py-1 rounded bg-white/10" placeholder="Téléphone" value={phone} onChange={e=>setPhone(e.target.value)} />
            <button className="px-3 py-1 rounded bg-white/10" onClick={addCompany}>Ajouter la société</button>
          </section>

          <section className="rounded-xl p-3 ring-1 ring-white/10 space-y-2">
            <h3 className="font-semibold">Stand sélectionné</h3>
            {selected ? (
              <div className="space-y-2">
                <input className="w-full px-2 py-1 rounded bg-white/10" value={selected.name} onChange={e=>updateBooth(selected.id,{name:e.target.value})} />
                <label className="text-sm block">Statut</label>
                <select className="w-full px-2 py-1 rounded bg-white/10" value={selected.status} onChange={e=>updateBooth(selected.id,{status:e.target.value})}>
                  {Object.values(STATUS).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <label className="text-sm block">Société</label>
                <select className="w-full px-2 py-1 rounded bg-white/10" value={selected.companyId||''} onChange={e=>updateBooth(selected.id,{companyId:e.target.value||undefined})}>
                  <option value=''>Non assignée</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <div className="flex gap-2">
                  <button className="px-3 py-1 rounded bg-white/10" onClick={()=>deleteBooth(selected.id)}>Supprimer</button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-400">Cliquez un stand pour l’éditer</div>
            )}
          </section>
        </aside>
      </main>

      <footer className="text-center text-xs text-slate-400 py-6">
        © {new Date().getFullYear()} ExpoPlanner — Démo
      </footer>
    </div>
  )
}
