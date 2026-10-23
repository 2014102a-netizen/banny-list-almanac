import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { MEDIA } from '../config/media';

export default function CelebrationFeature({ celebration, onOpen }) {
  return <section className="celebration" aria-label="Главное событие: день рождения банного вождя">
    <div className="celebration-heading"><span>{celebration.label}</span><span>Банный лист в сборе</span></div>
    <img className="celebration-photo" src={MEDIA.birthday} width="1280" height="591" alt="Банщики вместе в бане" fetchPriority="high" />
    <div className="celebration-body">
      <div className="celebration-greeting">
        <h2>{celebration.heading}</h2>
        <p>{celebration.greeting}</p>
        <p className="celebration-signature">{celebration.signature}</p>
        <button className="celebration-button" onClick={onOpen}>Вся программа и отметки <ArrowRight size={18} /></button>
      </div>
      <div className="celebration-program">
        {celebration.itinerary.map(stop => <div className="celebration-stop" key={stop.date}>
          <span className="celebration-date">{stop.date}</span><h3>{stop.title}</h3><p className="celebration-time">{stop.time}</p><p>{stop.note}</p>
          <a href={stop.url} target="_blank" rel="noreferrer">{stop.linkLabel} <ArrowUpRight size={14} /></a>
        </div>)}
      </div>
    </div>
    <div className="celebration-lineup"><span>На шоу заявлены</span><p>{celebration.lineup.join(' · ')}</p></div>
  </section>;
}
