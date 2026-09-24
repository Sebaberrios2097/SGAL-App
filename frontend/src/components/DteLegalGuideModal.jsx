import { useEffect, useState } from 'react';
import {
  BookOpen, BookText, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink,
  FileCheck2, FlaskConical, KeyRound, Rocket, ShieldCheck, X
} from 'lucide-react';

const sii = {
  portal: 'https://www.sii.cl/destacados/factura_electronica/',
  postulacion: 'https://www.sii.cl/destacados/factura_electronica/postulacion.htm',
  certificacion: 'https://www.sii.cl/factura_electronica/factura_mercado/proceso_certificacion.htm',
  menu: 'https://www.sii.cl/factura_electronica/factura_mercado/menu_certificacion.html',
  boletas: 'https://www.sii.cl/servicios_online/1039-guia_emitir_boleta_servicio-1184.html'
};

const slides = [
  {
    icon: BookOpen,
    eyebrow: 'Mapa general',
    title: 'De una prueba local a una boleta legal',
    lead: 'SGAL separa tres fases para evitar que una prueba termine accidentalmente en el SII.',
    steps: [
      ['Desarrollo local', 'Certificado y CAF ficticios. Sirve para revisar venta, XML, folio, PDF417 e impresión 80 mm. No tiene valor tributario.'],
      ['Certificación SII', 'Certificado y CAF reales del ambiente de pruebas. Los documentos se envían al SII como parte del proceso de certificación.'],
      ['Producción autorizada', 'Solo después de la autorización. Se usan CAF productivos y cada DTE emitido tiene validez tributaria.']
    ],
    warning: 'Que una boleta tenga folio y PDF417 no significa por sí solo que sea legal: también debe pertenecer a un emisor autorizado y ser enviada al ambiente correcto.'
  },
  {
    icon: KeyRound,
    eyebrow: 'Antes de postular',
    title: 'Requisitos del contribuyente',
    lead: 'Prepara la situación tributaria y las credenciales antes de cambiar SGAL a Certificación.',
    bullets: [
      'RUT con inicio de actividades vigente y condiciones tributarias exigidas por el SII.',
      'Representante legal o usuario autorizado sin situaciones pendientes que impidan la postulación.',
      'Certificado digital personal vigente del representante o usuario autorizado.',
      'Datos legales exactos: razón social, giro, dirección, comuna y actividades económicas.',
      'Correo operativo y respaldo seguro del certificado y su clave.'
    ],
    link: [sii.portal, 'Revisar etapas y requisitos en el SII']
  },
  {
    icon: ShieldCheck,
    eyebrow: 'Preparar SGAL',
    title: 'Configura el emisor sin dejar Desarrollo',
    lead: 'Puedes cargar datos reales y el certificado mientras sigues haciendo documentos ficticios.',
    bullets: [
      'Completa los datos del emisor en esta pantalla.',
      'Carga el archivo .p12/.pfx y su clave; SGAL cifra la clave antes de guardarla.',
      'Mantén la fase “Desarrollo local” mientras ajustas impresión, productos, IVA, descuentos y anulaciones.',
      'Usa “Emitir boleta de prueba” y confirma que el ticket 80 mm contiene logo, folio, totales y PDF417.',
      'No entregues una boleta de Desarrollo como comprobante tributario: no fue enviada ni aceptada por el SII.'
    ]
  },
  {
    icon: FlaskConical,
    eyebrow: 'Postulación',
    title: 'Ingresa al ambiente de certificación',
    lead: 'La postulación la realiza el representante legal en el sitio del SII.',
    bullets: [
      'Postula el RUT al sistema propio o de mercado usando el certificado digital.',
      'Una vez aceptada la postulación, entra al ambiente de certificación y solicita el set de pruebas.',
      'Solicita los CAF de certificación para cada tipo que probarás: 39, 41, 33, 34 y 61 según tu alcance.',
      'Carga esos CAF reales en SGAL; aparecerán separados de los CAF ficticios.',
      'Recién entonces cambia la fase de SGAL a “Certificación SII”.'
    ],
    link: [sii.postulacion, 'Abrir información oficial de postulación']
  },
  {
    icon: FileCheck2,
    eyebrow: 'Pruebas del SII',
    title: 'Completa el proceso de certificación',
    lead: 'El SII certifica los tipos de DTE que emitirá el contribuyente, no simplemente una copia del programa.',
    steps: [
      ['1. Set de pruebas', 'Genera los documentos exactamente con los casos y montos entregados por el SII.'],
      ['2. Simulación', 'Emite operaciones representativas del funcionamiento habitual del negocio.'],
      ['3. Intercambio', 'Cuando corresponda, demuestra recepción y respuesta entre emisores.'],
      ['4. Muestras impresas', 'Entrega representaciones impresas con el timbre PDF417 y formato exigido.'],
      ['5. Cumplimiento', 'Declara formalmente que cuentas con procedimientos y condiciones operativas.']
    ],
    warning: 'Durante esta etapa revisa en el panel que los envíos queden Aceptados. Corrige cualquier Rechazado antes de declarar avance.',
    link: [sii.certificacion, 'Ver proceso oficial de certificación']
  },
  {
    icon: CheckCircle2,
    eyebrow: 'Boletas electrónicas',
    title: 'Pruebas específicas de boletas',
    lead: 'Además del DTE individual, el proceso puede exigir archivos y reportes propios de boletas.',
    bullets: [
      'Descarga y sigue las instrucciones particulares del set de boletas entregado por el SII.',
      'Emite y envía los XML de boletas en certificación usando los folios solicitados.',
      'Genera las muestras impresas de 80 mm con su timbre PDF417.',
      'Prepara y envía el Reporte de Consumo de Folios conforme a las instrucciones vigentes del SII.',
      'Conserva XML, estados de envío, folios consumidos y notas de crédito como respaldo.'
    ],
    warning: 'La emisión legal no termina al imprimir el ticket. También deben cumplirse los reportes y obligaciones operativas vigentes del SII.',
    link: [sii.boletas, 'Abrir instructivo oficial de boletas electrónicas']
  },
  {
    icon: BookText,
    eyebrow: 'Glosario',
    title: 'Términos que encontrarás en el proceso',
    lead: 'Definiciones breves para completar la configuración y entender los estados del documento.',
    terms: [
      ['ACTECO', 'Código numérico de la actividad económica registrada ante el SII. Debe corresponder a una actividad vigente del contribuyente; puedes revisarlo en Mi SII.'],
      ['Razón social', 'Nombre legal con el que la persona o empresa está registrada ante el SII. Puede ser distinto del nombre comercial que aparece en el local.'],
      ['Nombre comercial', 'Nombre usado públicamente por el negocio, por ejemplo el de la cafetería. No reemplaza la razón social en los datos tributarios.'],
      ['Giro', 'Descripción de la actividad que realiza el contribuyente, como venta de alimentos o servicios informáticos. Debe coincidir con lo registrado en el SII.'],
      ['DTE', 'Documento Tributario Electrónico: el XML legal de una boleta, factura, nota de crédito u otro documento autorizado.'],
      ['Folio', 'Número correlativo de cada documento. El SII autoriza rangos de folios y SGAL consume uno por cada DTE emitido.'],
      ['CAF', 'Código de Autorización de Folios. Es el archivo XML entregado por el SII que autoriza un rango de folios para un tipo de DTE.'],
      ['TED / timbre electrónico', 'Resumen firmado del DTE. Se representa como el código PDF417 grande de la boleta y permite verificar su autenticidad.'],
      ['Certificado digital', 'Credencial electrónica personal que permite identificarse y firmar documentos en nombre del contribuyente autorizado.'],
      ['Emisor', 'Persona o empresa que realiza la venta y emite el documento. En esta instalación corresponde al único RUT configurado en SGAL.'],
      ['Receptor', 'Cliente que recibe el documento. En una factura se requieren sus datos tributarios; en una boleta normalmente se usa consumidor final.'],
      ['Track ID', 'Número de seguimiento que entrega el SII al recibir un envío. Sirve para consultar si quedó aceptado, rechazado o con reparos.'],
      ['Resolución SII', 'Número y fecha del acto con que el SII autoriza al contribuyente para operar electrónicamente. Se configura al pasar a producción.'],
      ['Maullin / certificación', 'Ambiente de pruebas del SII. Los documentos enviados allí sirven para certificar el flujo y no son ventas tributarias reales.'],
      ['Producción', 'Ambiente real del SII. Solo debe usarse después de la autorización; los documentos emitidos aquí sí tienen efectos tributarios.'],
      ['Nota de crédito', 'DTE usado para anular o corregir una boleta o factura ya emitida. Debe referenciar el documento original.'],
      ['Consumo de folios', 'Reporte que resume las boletas emitidas, anuladas y los folios utilizados en un período, según las instrucciones vigentes del SII.']
    ],
    warning: 'Si un dato legal no coincide con Mi SII, confirma la información con el contador o con el propio SII antes de iniciar la certificación.'
  },
  {
    icon: Rocket,
    eyebrow: 'Paso a producción',
    title: 'Activa producción solo después de la autorización',
    lead: 'El cambio no debe hacerse únicamente porque las pruebas locales funcionaron.',
    bullets: [
      'Confirma en el portal del SII que el RUT y los tipos de DTE están autorizados.',
      'Registra en SGAL el número y fecha de la resolución de autorización.',
      'Carga CAF obtenidos en el ambiente productivo; nunca reutilices CAF de prueba.',
      'Cambia la fase a “Producción autorizada”. Desde ese momento SGAL enviará los DTE al ambiente productivo.',
      'Realiza una primera emisión controlada y confirma que aparezca como Aceptada antes de operar normalmente.',
      'Monitorea folios, rechazos, notas de crédito, respaldos y consumo de folios todos los días.'
    ],
    warning: 'Si aún no existe autorización o resolución, mantén Certificación. Elegir Producción en SGAL no reemplaza la autorización del SII.',
    link: [sii.menu, 'Consultar opciones y estado en el SII']
  }
];

const DteLegalGuideModal = ({ open, onClose, estado }) => {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const keyDown = event => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') setIndex(value => Math.max(0, value - 1));
      if (event.key === 'ArrowRight') setIndex(value => Math.min(slides.length - 1, value + 1));
    };
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, [open, onClose]);

  if (!open) return null;
  const slide = slides[index];
  const Icon = slide.icon;
  return <div className="modal-overlay" style={{ zIndex: 1500 }} onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="modal-content" role="dialog" aria-modal="true" aria-labelledby="dte-guide-title"
      style={{ width: 'min(1040px, calc(100vw - 28px))', maxWidth: 1040, height: 'min(760px, calc(100vh - 30px))', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '20px 24px', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
        <div><div style={{ color: 'var(--primary-color)', fontSize: '.76rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>Guía de puesta en marcha DTE</div><h2 id="dte-guide-title" style={{ margin: '4px 0 0', fontSize: '1.28rem' }}>Cómo emitir boletas legalmente con SGAL</h2></div>
        <button type="button" className="btn" onClick={onClose} aria-label="Cerrar guía" style={{ padding: 8 }}><X size={20} /></button>
      </header>

      <div className="dte-guide-layout" style={{ flex: 1, minHeight: 0 }}>
        <aside className="dte-guide-nav" style={{ padding: 18, borderRight: '1px solid var(--panel-border)', background: 'var(--bg-color)', overflowY: 'auto' }}>
          {slides.map((item, slideIndex) => <button key={item.title} type="button" onClick={() => setIndex(slideIndex)}
            style={{ width: '100%', border: 0, borderRadius: 9, padding: '10px 11px', marginBottom: 5, textAlign: 'left', cursor: 'pointer', background: slideIndex === index ? 'var(--primary-color)' : 'transparent', color: slideIndex === index ? '#fff' : 'inherit', fontWeight: slideIndex === index ? 800 : 600, fontSize: '.82rem' }}>
            <span style={{ opacity: .72, marginRight: 7 }}>{slideIndex + 1}.</span>{item.eyebrow}
          </button>)}
          {estado && <div style={{ marginTop: 16, padding: 11, border: '1px solid var(--panel-border)', borderRadius: 10, fontSize: '.78rem' }}><strong>Tu estado actual</strong><div style={{ marginTop: 5, color: 'var(--text-secondary)' }}>{estado.titulo}</div></div>}
        </aside>

        <main className="dte-guide-body" style={{ padding: '30px clamp(24px, 4vw, 48px)', overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}><div style={{ width: 54, height: 54, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--primary-color) 14%, transparent)', color: 'var(--primary-color)' }}><Icon size={28} /></div><div><div style={{ color: 'var(--primary-color)', fontWeight: 800, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.08em' }}>{slide.eyebrow}</div><h3 style={{ margin: '4px 0 0', fontSize: '1.55rem' }}>{slide.title}</h3></div></div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.6, marginBottom: 22 }}>{slide.lead}</p>
          {slide.bullets && <div style={{ display: 'grid', gap: 11 }}>{slide.bullets.map((bullet, bulletIndex) => <div key={bullet} style={{ display: 'flex', gap: 11, lineHeight: 1.45 }}><CheckCircle2 size={18} color="var(--primary-color)" style={{ flexShrink: 0, marginTop: 2 }} /><span>{bullet}</span></div>)}</div>}
          {slide.steps && <div style={{ display: 'grid', gap: 10 }}>{slide.steps.map(([name, detail], stepIndex) => <div key={name} style={{ border: '1px solid var(--panel-border)', borderRadius: 11, padding: 14, display: 'grid', gridTemplateColumns: '32px 1fr', gap: 10 }}><div style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--primary-color)', color: '#fff', fontWeight: 800, fontSize: '.78rem' }}>{stepIndex + 1}</div><div><strong>{name}</strong><div style={{ marginTop: 3, color: 'var(--text-secondary)', fontSize: '.88rem', lineHeight: 1.45 }}>{detail}</div></div></div>)}</div>}
          {slide.terms && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>{slide.terms.map(([term, definition]) => <div key={term} style={{ border: '1px solid var(--panel-border)', borderRadius: 10, padding: 13 }}><strong style={{ color: 'var(--primary-color)' }}>{term}</strong><div style={{ marginTop: 5, color: 'var(--text-secondary)', fontSize: '.84rem', lineHeight: 1.45 }}>{definition}</div></div>)}</div>}
          {slide.warning && <div style={{ display: 'flex', gap: 10, marginTop: 20, padding: 14, borderRadius: 10, background: 'rgba(217,119,6,.10)', color: 'var(--text-primary)' }}><ShieldCheck size={19} color="#d97706" style={{ flexShrink: 0 }} /><span style={{ fontSize: '.86rem', lineHeight: 1.45 }}>{slide.warning}</span></div>}
          {slide.link && <a href={slide.link[0]} target="_blank" rel="noreferrer" className="btn" style={{ display: 'inline-flex', marginTop: 20, textDecoration: 'none' }}>{slide.link[1]} <ExternalLink size={15} /></a>}
        </main>
      </div>

      <footer style={{ padding: '15px 22px', borderTop: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 15 }}>
        <button type="button" className="btn" disabled={index === 0} onClick={() => setIndex(value => value - 1)}><ChevronLeft size={17} /> Anterior</button>
        <div style={{ display: 'flex', gap: 6 }}>{slides.map((_, dot) => <button key={dot} type="button" aria-label={`Ir al paso ${dot + 1}`} onClick={() => setIndex(dot)} style={{ width: dot === index ? 24 : 8, height: 8, border: 0, borderRadius: 10, padding: 0, background: dot === index ? 'var(--primary-color)' : 'var(--panel-border)', cursor: 'pointer' }} />)}</div>
        {index < slides.length - 1 ? <button type="button" className="btn btn-primary" onClick={() => setIndex(value => value + 1)}>Siguiente <ChevronRight size={17} /></button> : <button type="button" className="btn btn-primary" onClick={onClose}>Terminar <CheckCircle2 size={17} /></button>}
      </footer>
    </section>
  </div>;
};

export default DteLegalGuideModal;
