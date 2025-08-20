import React, { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Rect, Line, Group, Text as KonvaText, Image as KonvaImage } from 'react-konva'
import * as pdfjsLib from 'pdfjs-dist'
// Worker pdf.js via Vite (fiable sur Render)
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const STATUS = {
  available: { key: 'available', label: 'Disponible', color: '#10B981' },
  reserved:  { key: 'reserved',  label: 'Réservé',    color: '#F59E0B' },
  occupied:  { key: 'occupied',  label: 'Occupé',     color: '#EF4444' },
}
const uid = () => Math.random().toString(36).slice(2,9)

export default function App(){
  // Outils: select | pan | rect | i | l | u | draw
  const [tool, setTool] = useState('select')
  const [booths, setBooths] = useState([])
  const [companies, setCompanies] = useState([])
  const [selectedId, setSelectedId] = useState(null)

  // Pan & zoom
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const [stageSize, setStageSize] = useState({width: 360, height: 560})

  // PDF
  const [pdfImage, setPdfImage] = useState(null)
  const [pdfSize, setPdfSize] = useState({ width: 0, height: 0 })

  // Dessin libre (polygone)
  const [isDrawing, setIsDrawing] = useState(false)
  const [draftPoints, setDraftPoints] = useState([]) // coordonnées monde

  const fileRef = useRef(null)
  const jsonRef = useRef(null)

  useEffect(()=>{
    const onResize = () => setStageSize({width: window.innerWidth, height: Math.max(560, window.innerHeight-180)})
    onResize()
    window.addEventListener('resize', onResize)
    return ()=> window.removeEventListener('resize', onResize)
  },[])

  // Helpers: screen <-> world
  const toWorld = (p) => ({ x: (p.x - view.x)/view.scale, y: (p.y - view.y)/view.scale })

  // Import PDF -> image
  const onImportPdf = async (file) => {
    const buf = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise
    const page = await pdf.getPage(1)
    const v = page.getViewport({ scale: 1 })
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = Math.ceil(v.width)
    canvas.height = Math.ceil(v.height)
    await page.render({ canvasContext: ctx, viewport: v }).promise
    const img = new Image()
    img.src = canvas.toDataURL('image/png')
    await new Promise(res => img.onload = () => res(null))
    setPdfImage(img)
    setPdfSize({ width: canvas.width, height: canvas.height })
    // Fit à l'écran
    const fitScale = Math.min(stageSize.width / canvas.width, stageSize.height / canvas.height)
    const offX = (stageSize.width - canvas.width * fitScale)/2
    const offY = (stageSize.height - canvas.height * fitScale)/2
    setView({ x: offX, y: offY, scale: fitScale })
  }

  // Ajouter un stand selon forme
  const addBooth = (shape, wx, wy) => {
    const base = { id: uid(), name: 'Booth ' + (booths.length+1), shape, x: wx, y: wy, w: 120, h: 80, status: 'available', points: [] }
    if (shape==='i'){ base.points=[0,0,120,0,120,30,0,30]; base.h=30 }
    if (shape==='l'){ base.points=[0,0,120,0,120,30,30,30,30,120,0,120]; base.w=120; base.h=120 }
    if (shape==='u'){ base.points=[0,0,140,0,140,30,110,30,110,90,30,90,30,30,0,30]; base.w=140; base.h=90 }
    setBooths(prev=>[...prev, base])
    setSelectedId(base.id)
  }
  const updateBooth = (id, patch) => setBooths(prev => prev.map(b => b.id===id ? { ...b, ...patch } : b))
  const deleteBooth = (id) => setBooths(prev => prev.filter(b => b.id!==id))
  const selected = booths.find(b=>b.id===selectedId) || null
  const colorFill = (s) => STATUS[s].color + '59'
  const companyName = (id) => companies.find(c=>c.id===id)?.name || 'Non assignée'

  // Export/Import JSON
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

  // PANNING
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ sx:0, sy:0, vx:0, vy:0 })
  const onStagePointerDown = (e) => {
    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()
    if (!pos) return

    if (tool === 'pan') {
      setIsPanning(true)
      setPanStart({ sx: pos.x, sy: pos.y, vx: view.x, vy: view.y })
      return
    }

    if (tool === 'draw') {
      const world = toWorld(pos)
      setIsDrawing(true)
      setDraftPoints([world.x, world.y])
      setSelectedId(null)
      return
    }

    if (tool === 'select') {
      setSelectedId(null)
      return
    }

    // Templates
    const world = toWorld(pos)
    addBooth(tool, world.x-60, world.y-40)
  }
  const onStagePointerMove = (e) => {
    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()
    if (!pos) return

    if (isPanning) {
      const dx = pos.x - panStart.sx
      const dy = pos.y - panStart.sy
      setView(v => ({ ...v, x: panStart.vx + dx, y: panStart.vy + dy }))
      return
    }
    if (isDrawing) {
      const w = toWorld(pos)
      setDraftPoints(prev => [...prev, w.x, w.y])
    }
  }
  const onStagePointerUp = () => {
    if (isPanning) setIsPanning(false)
    if (isDrawing) {
      // finalize polygon: absolu -> ancre locale + points relatifs
      const xs = draftPoints.filter((_,i)=>i%2===0)
      const ys = draftPoints.filter((_,i)=>i%2===1)
      const minX = Math.min(...xs), minY = Math.min(...ys)
      const rel = draftPoints.map((v,i)=> i%2===0 ? v - minX : v - minY)
      const id = uid()
      const booth = { id, name:'Booth '+(booths.length+1), shape:'polygon', x:minX, y:minY, w:0, h:0, status:'available', points: rel }
      setBooths(prev => [...prev, booth])
      setSelectedId(id)
      setIsDrawing(false)
      setDraftPoints([])
    }
  }

  // WHEEL ZOOM
  const onWheel = (e) => {
    e.evt.preventDefault()
    const stage = e.target.getStage()
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const world = toWorld(pointer)
    const scaleBy = 1.05
    const direction = e.evt.deltaY > 0 ? -1 : 1
    const newScale = direction > 0 ? view.scale * scaleBy : view.scale / scaleBy
    const clamped = Math.max(0.2, Math.min(5, newScale))
    const newX = pointer.x - world.x * clamped
    const newY = pointer.y - world.y * clamped
    setView({ x: newX, y: newY, scale: clamped })
  }
  const zoomTo = (factor) => {
    const center = { x: stageSize.width/2, y: stageSize.height/2 }
    const world = toWorld(center)
    const newScale = Math.max(0.2, Math.min(5, view.scale * factor))
    const newX = center.x - world.x * newScale
    const newY = center.y - world.y * newScale
    setView({ x: newX, y: newY, scale: newScale })
  }
  const resetView = () => {
    if (!pdfImage) { setView({ x:0, y:0, scale:1 }); return }
    const fit = Math.min(stageSize.width / pdfSize.width, stageSize.height / pdfSize.height)
    const offX = (stageSize.width - pdfSize.width * fit)/2
    const offY = (stageSize.height - pdfSize.height * fit)/2
    setView({ x: offX, y: offY, scale: fit })
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-[rgba(15,23,42,0.85)] backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-3 py-3 flex items-center gap-2">
          <div className="font-semibold">ExpoPlanner</div>
          <div className="ml-auto flex flex-wrap gap-2">
            {/* Outils */}
            <button className={tool==='select'?'px-3 py-1 rounded bg-white/10':'px-3 py-1 rounded bg-white/5'} onClick={()=>setTool('select')}>Sélection</button>
            <button className={tool==='pan'?'px-3 py-1 rounded bg-white/10':'px-3 py-1 rounded bg-white/5'} onClick={()=>setTool('pan')}>Déplacer</button>
            <button className={tool==='rect'?'px-3 py-1 rounded bg-white/10':'px-3 py-1 rounded bg-white/5'} onClick={()=>setTool('rect')}>Rect</button>
            <button className={tool==='i'?'px-3 py-1 rounded bg-white/10':'px-3 py-1 rounded bg-white/5'} onClick={()=>setTool('i')}>I</button>
            <button className={tool==='l'?'px-3 py-1 rounded bg-white/10':'px-3 py-1 rounded bg-white/5'} onClick={()=>setTool('l')}>L</button>
            <button className={tool==='u'?'px-3 py-1 rounded bg-white/10':'px-3 py-1 rounded bg-white/5'} onClick={()=>setTool('u')}>U</button>
            <button className={tool==='draw'?'px-3 py-1 rounded bg-white/10':'px-3 py-1 rounded bg-white/5'} onClick={()=>setTool('draw')}>Forme libre</button>
            {/* Import/Export */}
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e=> e.target.files?.[0] && onImportPdf(e.target.files[0])} />
            <button className="px-3 py-1 rounded bg-white/5" onClick={()=>fileRef.current?.click()}>Importer PDF</button>
            <input ref={jsonRef} type="file" accept="application/json" className="hidden" onChange={e=> e.target.files?.[0] && importJSON(e.target.files[0])} />
            <button className="px-3 py-1 rounded bg-white/5" onClick={()=>jsonRef.current?.click()}>Importer Plan</button>
            <button className="px-3 py-1 rounded bg-white/5" onClick={exportJSON}>Sauvegarder</button>
            {/* Zoom */}
            <button className="px-3 py-1 rounded bg-white/5" onClick={()=>zoomTo(1.2)}>Zoom +</button>
            <button className="px-3 py-1 rounded bg-white/5" onClick={()=>zoomTo(1/1.2)}>Zoom −</button>
            <button className="px-3 py-1 rounded bg-white/5" onClick={resetView}>Ajuster</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 py-4 grid grid-cols-1 md:grid-cols-[1fr_320px] gap-4">
        {/* Canvas pan+zoom : tout est dans le même Group transformé */}
        <div className="rounded-2xl ring-1 ring-white/10 overflow-hidden">
          <Stage
            width={stageSize.width}
            height={stageSize.height}
            onPointerDown={onStagePointerDown}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerUp}
            onWheel={onWheel}
          >
            <Layer>
              <Group x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale}>
                {/* PDF en 1:1, plus d'étirement */}
                {pdfImage ? (
                  <KonvaImage image={pdfImage} x={0} y={0} width={pdfSize.width} height={pdfSize.height} listening={false} />
                ) : (
                  <Group>
                    <Rect x={0} y={0} width={stageSize.width} height={stageSize.height} fill={'#0B1220'} />
                    <KonvaText text="Importez un PDF du plan pour démarrer" x={16} y={16} fill="#9CA3AF" fontSize={14} />
                  </Group>
                )}

                {/* Stands */}
                {booths.map(b => (
                  <Group key={b.id} x={b.x} y={b.y} draggable={tool==='select'}
                    onDragMove={e=>updateBooth(b.id,{x:e.target.x(), y:e.target.y()})}
                    onClick={()=>setSelectedId(b.id)} onTap={()=>setSelectedId(b.id)}
                    onDblClick={()=>alert(`Stand: ${b.name}\nStatut: ${b.status}\nSociété: ${companyName(b.companyId)}`)}
                    onDblTap={()=>alert(`Stand: ${b.name}\nStatut: ${b.status}\nSociété: ${companyName(b.companyId)}`)}
                  >
                    {b.shape==='rect' && <Rect width={b.w} height={b.h} cornerRadius={8} fill={colorFill(b.status)} stroke={b.id===selectedId?'#fff':'rgba(255,255,255,0.5)'} />}
                    {(b.shape==='i'||b.shape==='l'||b.shape==='u') && <Line points={b.points||[]} closed fill={colorFill(b.status)} stroke={b.id===selectedId?'#fff':'rgba(255,255,255,0.5)'} />}
                    {b.shape==='polygon' && <Line points={b.points||[]} closed fill={colorFill(b.status)} stroke={b.id===selectedId?'#fff':'rgba(255,255,255,0.8)'} />}
                    <KonvaText text={b.name} fill="#E5E7EB" x={8} y={8} fontSize={12} />
                  </Group>
                ))}

                {/* Trait de dessin en cours */}
                {isDrawing && draftPoints.length>=4 && (
                  <Line points={draftPoints} stroke={'#fff'} strokeWidth={2} lineCap="round" lineJoin="round" dash={[6,4]} />
                )}
              </Group>
            </Layer>
          </Stage>
        </div>

        {/* Rail droit */}
        <aside className="space-y-4">
          {/* Bibliothèque formes */}
          <section className="rounded-xl p-3 ring-1 ring-white/10">
            <h3 className="font-semibold mb-2">Bibliothèque de formes</h3>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <button className={tool==='rect'?'px-2 py-2 rounded bg-white/10':'px-2 py-2 rounded bg-white/5'} onClick={()=>setTool('rect')}>Rectangle</button>
              <button className={tool==='i'?'px-2 py-2 rounded bg-white/10':'px-2 py-2 rounded bg-white/5'} onClick={()=>setTool('i')}>I</button>
              <button className={tool==='l'?'px-2 py-2 rounded bg-white/10':'px-2 py-2 rounded bg-white/5'} onClick={()=>setTool('l')}>L</button>
              <button className={tool==='u'?'px-2 py-2 rounded bg-white/10':'px-2 py-2 rounded bg-white/5'} onClick={()=>setTool('u')}>U</button>
              <button className={tool==='draw'?'px-2 py-2 rounded bg-white/10':'px-2 py-2 rounded bg-white/5'} onClick={()=>setTool('draw')}>Forme libre</button>
              <button className={tool==='select'?'px-2 py-2 rounded bg-white/10':'px-2 py-2 rounded bg-white/5'} onClick={()=>setTool('select')}>Sélection</button>
            </div>
            <p className="text-xs text-slate-400 mt-2">Cliquez sur le plan pour poser la forme. “Forme libre” : cliquez-glissez pour dessiner, relâchez pour terminer.</p>
            <p className="text-xs text-slate-400">Outil “Déplacer” : panner le plan à la souris (ou au doigt). Molette pour zoomer.</p>
          </section>

          {/* Sociétés */}
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
            <CompanyAdder onAdd={(c)=>setCompanies(prev=>[...prev,c])} />
          </section>

          {/* Stand sélectionné */}
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

function CompanyAdder({ onAdd }){
  const [name,setName]=React.useState('')
  const [website,setWebsite]=React.useState('')
  const [email,setEmail]=React.useState('')
  const [phone,setPhone]=React.useState('')
  const submit = () => {
    if(!name.trim()) return
    onAdd({ id: Math.random().toString(36).slice(2,9), name: name.trim(), website, email, phone })
    setName(''); setWebsite(''); setEmail(''); setPhone('')
  }
  return (
    <div className="space-y-2">
      <input className="w-full px-2 py-1 rounded bg-white/10" placeholder="Nom" value={name} onChange={e=>setName(e.target.value)} />
      <input className="w-full px-2 py-1 rounded bg-white/10" placeholder="Site web" value={website} onChange={e=>setWebsite(e.target.value)} />
      <input className="w-full px-2 py-1 rounded bg-white/10" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
      <input className="w-full px-2 py-1 rounded bg-white/10" placeholder="Téléphone" value={phone} onChange={e=>setPhone(e.target.value)} />
      <button className="px-3 py-1 rounded bg-white/10" onClick={submit}>Ajouter la société</button>
    </div>
  )
}
