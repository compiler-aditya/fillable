import { useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { ArrowDown, ArrowRight, ArrowUpRight, BellRing, Bookmark, Check, FileText, LockKeyhole, Pill, Search } from 'lucide-react';
import { api } from '../convex/_generated/api';
import './landing.css';

type Props = {
  onGetStarted: () => void;
};

const availabilityLabels = {
  available: 'Manufacturer reports available',
  limited: 'Limited availability reported',
  unavailable: 'Manufacturer reports unavailable',
  unknown: 'Availability not specified',
} as const;

function sourceDate(value: string | number | undefined) {
  if (value === undefined) return 'Not provided';
  const date = new Date(typeof value === 'number' ? value : `${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? 'Not provided' : new Intl.DateTimeFormat('en-US', {month:'short', day:'numeric', year:'numeric', timeZone:'UTC'}).format(date);
}

export function LandingPage({ onGetStarted }: Props) {
  const board = useQuery(api.drugs.board, { limit: 24 });
  const [exampleId, setExampleId] = useState('');
  const [panel, setPanel] = useState(0);
  const examples = useMemo(() => {
    if (board === undefined) return [];
    const preferredBrands = ['ADDERALL', 'VYVANSE', 'CONCERTA'];
    const picked = preferredBrands.flatMap((brand) => {
      const match = board.find((drug) => drug.brandNames.includes(brand));
      return match === undefined ? [] : [match];
    });
    return picked.length > 0 ? picked : board.slice(0, 3);
  }, [board]);
  const exampleDrug = examples.find((drug) => drug.slug === exampleId) ?? examples[0];
  const detail = useQuery(
    api.drugs.detail,
    exampleDrug === undefined ? 'skip' : { slug: exampleDrug.slug },
  );
  const example = detail?.askFor;
  const sourceUrl = exampleDrug === undefined
    ? 'https://www.accessdata.fda.gov/scripts/drugshortages/'
    : `https://www.accessdata.fda.gov/scripts/drugshortages/dsp_ActiveIngredientDetails.cfm?AI=${encodeURIComponent(exampleDrug.genericName)}&st=c`;
  function jump(id: string) {
    const target = document.getElementById(id);
    target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block:'center' });
    target?.focus({ preventScroll:true });
  }
  return <div className="fl-home">
    <a className="fl-skip" href="#fl-main" onClick={e=>{e.preventDefault();jump('fl-main');}}>Skip to content</a>
    <header className="fl-header">
      <a href="/" className="fl-logo" aria-label="Fillable home"><span><Pill size={23}/></span>fillable.</a>
      <nav aria-label="Landing navigation"><button onClick={()=>jump('fl-workflow')}>How it works</button><button onClick={()=>jump('fl-evidence')}>Our sources</button></nav>
      <button className="fl-nav-cta" onClick={onGetStarted}>Open live tracker<ArrowUpRight size={17}/></button>
    </header>
    <main id="fl-main" tabIndex={-1}>
      <section className="fl-hero" aria-labelledby="fl-title">
        <div className="fl-hero-copy">
          <span className="fl-eyebrow"><span className="fl-dot"/> CLARITY BEFORE YOUR NEXT REFILL</span>
          <h1 id="fl-title">Your next refill.<br/><em>A little less unknown.</em></h1>
          <p>Medication shortages leave you with questions. Turn public FDA and ASHP supply records into exact product details and a better conversation with your pharmacist.</p>
          <div className="fl-hero-actions"><button className="fl-button" onClick={onGetStarted}>Explore live records<ArrowRight size={18}/></button><button className="fl-text-button" onClick={()=>jump('fl-example-select')}>Try the preview<ArrowDown size={17}/></button></div>
          <div className="fl-reassurance"><Check size={15}/><span>No prescription upload</span><span aria-hidden="true">·</span><span>No sign-in required</span></div>
          <div className="fl-path" aria-label="Your path with Fillable"><span>Find a medication</span><ArrowRight size={14}/><span>Check exact packages</span><ArrowRight size={14}/><span>Ask with confidence</span></div>
        </div>
        <div className="fl-preview-wrap">
          <div className="fl-preview-orbit" aria-hidden="true"><Pill size={22}/></div>
          <div className="fl-preview-caption"><span><span className="fl-dot"/> TRY A REAL EXAMPLE</span><span>No sign-in needed</span></div>
          <section className="fl-preview" aria-label="Medication preview">
              <div className="fl-preview-search"><label htmlFor="fl-example-select">Choose an example medication</label><div><Search size={18}/><select id="fl-example-select" value={exampleDrug?.slug ?? ''} disabled={exampleDrug === undefined} onChange={e=>setExampleId(e.target.value)}>{exampleDrug === undefined && <option value="">{board === undefined ? 'Loading FDA records…' : 'Examples currently unavailable'}</option>}{examples.map(drug=><option key={drug._id} value={drug.slug}>{drug.brandNames[0] ?? drug.displayName}</option>)}</select></div></div>
            {example !== undefined && exampleDrug !== undefined ? <>
              <div className="fl-preview-heading"><span className="fl-product-icon"><Pill size={25}/></span><div><h2>{exampleDrug.brandNames[0] ?? exampleDrug.displayName}</h2><p>{example.presentationText}</p></div></div>
              <div className="fl-preview-tabs" role="tablist" aria-label="Preview details">{['Supply record','Pharmacy questions'].map((label,index)=><button key={label} id={`fl-tab-${index}`} role="tab" aria-selected={panel===index} aria-controls="fl-preview-panel" tabIndex={panel===index ? 0 : -1} onClick={()=>setPanel(index)} onKeyDown={e=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?1:1-panel;setPanel(next);document.getElementById(`fl-tab-${next}`)?.focus();}}>{index===0 ? <FileText size={15}/> : <Bookmark size={15}/>}<span>{label}</span></button>)}</div>
              <div className="fl-preview-context"><span className="fl-eyebrow">THE NAME IS JUST THE START</span><p>Look closer at the manufacturer and exact package. Then ask what your pharmacy can obtain.</p><div><span>01 / Choose</span><ArrowRight size={13}/><span>02 / Understand</span></div></div>
              <div className="fl-preview-panel" id="fl-preview-panel" role="tabpanel" aria-labelledby={`fl-tab-${panel}`} tabIndex={0}>
                {panel===0 ? <>
                  <div className={`fl-supply fl-supply-${example.availability}`}><span className="fl-supply-label">REPORTED MANUFACTURER SUPPLY</span><strong><span/>{availabilityLabels[example.availability]}</strong><p>Local pharmacy stock still needs to be confirmed.</p></div>
                  <dl className="fl-facts"><div><dt>Manufacturer</dt><dd>{example.companyName}</dd></div><div><dt>National Drug Code <span>(NDC)</span></dt><dd className="fl-code">{example.packageNdc}</dd></div><div><dt>FDA source updated</dt><dd>{sourceDate(example.fdaUpdateAtMs)}</dd></div></dl>
                  <p className="fl-fact-note">An NDC identifies a specific product and package. Use it to ask a more precise question.</p>
                  <a className="fl-source" href={sourceUrl} target="_blank" rel="noreferrer">Open the original FDA record<ArrowUpRight size={15}/></a>
                </> : <div className="fl-questions"><span className="fl-eyebrow">BRING THE EXACT DETAILS</span><h3>A starting point for your next call.</h3><p>Ask your pharmacist about NDC <strong>{example.packageNdc}</strong>:</p><ol><li>Does this exact product match my prescription?</li><li>Can your pharmacy obtain this presentation?</li><li>If it cannot be filled, what should I ask my prescriber?</li></ol><p className="fl-fact-note">Keep medication decisions with your pharmacist or prescriber. A supply report is not a treatment recommendation.</p></div>}
              </div>
            </> : <div className="fl-preview-empty" role="status"><FileText size={32}/><h2>{board === undefined ? 'Finding the exact details…' : 'The source preview is unavailable.'}</h2><p>{board === undefined ? 'Loading public manufacturer records from the live catalog.' : 'Please try again later. We only show examples backed by the catalog.'}</p></div>}
            <div className="fl-preview-save"><LockKeyhole size={17}/><span>Explore 241 medications without sharing personal information.</span><button onClick={onGetStarted}>Open tracker<ArrowRight size={16}/></button></div>
          </section>
          <p className="fl-preview-footnote">Public FDA data. An example of reported supply, not a local stock check.</p>
        </div>
      </section>
      <section className="fl-proof-strip" aria-label="What informs the preview"><span><FileText size={18}/> Public FDA records</span><span><Pill size={18}/> Exact product & package</span><span><BellRing size={18}/> Live source conflicts</span></section>
      <section className="fl-workflow" id="fl-workflow" tabIndex={-1}>
        <div className="fl-section-heading"><span className="fl-eyebrow">A CLEARER WAY FORWARD</span><h2>From “what now?”<br/><em>to a useful next step.</em></h2><p>Start with a real example, then search every tracked shortage.</p></div>
        <div className="fl-steps"><article><span className="fl-step-number">01</span><Search size={23}/><h3>Look closer.</h3><p>See how manufacturer, presentation, and NDC turn a medication name into an exact record.</p><button className="fl-text-button" onClick={()=>jump('fl-example-select')}>Explore the example<ArrowUpRight size={16}/></button></article><article><span className="fl-step-number">02</span><Bookmark size={23}/><h3>Compare the packages.</h3><p>See which exact versions are available, limited, or unavailable inside the same overall shortage.</p><span className="fl-step-tag"><LockKeyhole size={13}/> No personal health data</span></article><article><span className="fl-step-number">03</span><BellRing size={23}/><h3>Check both sources.</h3><p>See where ASHP lists a current shortage that the FDA record does not, with links back to source evidence.</p><span className="fl-step-tag">FDA + ASHP, reconciled live</span></article></div>
      </section>
      <section className="fl-evidence" id="fl-evidence" tabIndex={-1}><div><span className="fl-eyebrow">USEFUL INFORMATION. HONEST LIMITS.</span><h2>A source you can check.<br/><em>A decision you make together.</em></h2></div><div className="fl-evidence-detail"><article><FileText size={20}/><div><h3>See where every signal comes from.</h3><p>Records include the manufacturer, exact presentation, source date, and original FDA or ASHP evidence.</p></div></article><article><Pill size={20}/><div><h3>Supply is one piece of the picture.</h3><p>“Available” describes a manufacturer’s report. It doesn’t confirm pharmacy stock, insurance coverage, or suitability for your prescription.</p></div></article><article><LockKeyhole size={20}/><div><h3>No prescription upload required.</h3><p>The full tracker is public. Fillable never asks for a prescription, pharmacy account, or personal health details.</p></div></article></div></section>
      <section className="fl-closing"><div><span className="fl-eyebrow">ONE LESS THING TO KEEP CHECKING</span><h2>Your next refill,<br/><em>with a clearer starting point.</em></h2></div><div><button className="fl-button" onClick={onGetStarted}>Open live tracker<ArrowRight size={18}/></button><p>Find the package. Check the source. Ask precisely.</p></div></section>
    </main>
    <footer className="fl-footer"><a href="/" className="fl-logo" aria-label="Fillable home"><span><Pill size={23}/></span>fillable.</a><span>Clarity before your next refill.</span><span>© 2026 Fillable</span></footer>
  </div>;
}
