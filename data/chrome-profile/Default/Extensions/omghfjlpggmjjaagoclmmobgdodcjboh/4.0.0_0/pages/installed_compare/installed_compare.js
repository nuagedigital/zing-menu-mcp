(()=>{"use strict";var e,i={8775(e,i,a){a(5564);var t=a(5087),r=a(7130),d=a(1743),c=a(1927),n=a(392);a(3894);Object.defineProperty(p,"name",{value:"default",configurable:!0});const s=Object.fromEntries(Object.entries({title:"installed_compare_title",subtitle:"installed_compare_subtitle",description:"installed_compare_description",free:"installed_compare_free",freePrice:"installed_compare_free_price",premium:"installed_compare_premium",premiumPrice:"installed_compare_premium_price",encryption:"installed_compare_encryption",noAds:"installed_compare_no_ads",speed:"installed_compare_speed",servers:"installed_compare_servers",desktopApp:"installed_compare_desktop_app",continueFree:"installed_compare_continue_free",getPremium:"installed_compare_get_premium",ruFreeIssue:"installed_compare_ru_free_issue",ruPremiumStable:"installed_compare_ru_premium_stable"}).map((([e,i])=>[e,(0,r.A)(i)]))),l="ru"===(0,d.A)();function o(e){e.preventDefault(),n.A.track("congrats_tab_free",{campaign:"default"}),window.location.href="/pages/congratulations/congratulations.html"}function m(e){e.currentTarget.getAttribute("href")?n.A.track("congrats_tab_click",{campaign:"default"}):e.preventDefault()}function p(){return c.qy`
  <style>
${t.A}

  :host { --page-width: 960px; }
  .In { max-width: var(--page-width); margin: 0 auto; padding: 56px var(--page-gutter) 72px; }
  .Header { max-width: 700px; margin-bottom: 36px; }
  .Subtitle { margin-top: 16px; font-size: 18px; font-weight: 500; }
  .Description { margin-top: 8px; color: var(--text-dim); }
  .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px; }
  .card { display: flex; flex-direction: column; padding: 28px; border: 1px solid var(--line-2); border-radius: 10px; }
  .card:last-child { border-color: var(--accent-ring); background: var(--accent-soft); }
  .card-header { margin-bottom: 24px; }
  .card-title { font-size: 26px; font-weight: 600; line-height: 1.3; }
  .card-subtitle { color: var(--text-dim); font-size: 14px; margin-top: 6px; }
  .card-items { display: flex; flex-direction: column; gap: 12px; }
  .card-item { display: flex; align-items: center; gap: 12px; font-size: 15px; }
  .card-item-icon { display: grid; place-items: center; flex: 0 0 20px; width: 20px; height: 20px; color: var(--accent); font-weight: 600; line-height: 1; text-align: center; }
  .card-item-icon.unavailable { color: var(--text-mute); font-size: 20px; }
  .card-item-icon.warning { color: var(--warn); font-size: 20px; }
  .card-actions { margin-top: auto; padding-top: 32px; }
  .card-button { display: block; width: 100%; }
  .free-button { background: var(--bg); color: var(--text); border: 1px solid var(--line-2); }
  .free-button:hover { background: var(--surface-2); }
  .premium-button[aria-disabled='true'] { opacity: .6; cursor: wait; }
  @media (max-width: 660px) { .In { padding: 32px var(--page-gutter) 48px; } .cards { grid-template-columns: minmax(0, 1fr); gap: 20px; } .card { padding: 24px; } }

  </style>

  <tab-header></tab-header>
  <main class="In">
    <div class="Header">
      <h1 class="Title">${s.title}</h1>
      <div class="Subtitle">${s.subtitle}</div>
      <div class="Description">${s.description}</div>
    </div>

    <div class="compare-cards">
      <div class="cards">
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">${s.free}</h2>
            <div class="card-subtitle">${s.freePrice}</div>
          </div>

          <div class="card-items">
            ${l?c.qy`
              <div class="card-item">
                <div class="card-item-icon warning" aria-hidden="true">!</div>
                <div class="card-item-text">${s.ruFreeIssue}</div>
              </div>`:""}
            <div class="card-item">
              <div class="card-item-icon" role="img" aria-label="${(0,r.A)("feature_included")}">✓</div>
              <div class="card-item-text">${s.encryption}</div>
            </div>
            <div class="card-item">
              <div class="card-item-icon" role="img" aria-label="${(0,r.A)("feature_included")}">✓</div>
              <div class="card-item-text">${s.noAds}</div>
            </div>
            <div class="card-item">
              <div class="card-item-icon unavailable" role="img" aria-label="${(0,r.A)("feature_not_included")}">–</div>
              <div class="card-item-text">${s.speed}</div>
            </div>
            <div class="card-item">
              <div class="card-item-icon unavailable" role="img" aria-label="${(0,r.A)("feature_not_included")}">–</div>
              <div class="card-item-text">${s.servers}</div>
            </div>
            <div class="card-item">
              <div class="card-item-icon unavailable" role="img" aria-label="${(0,r.A)("feature_not_included")}">–</div>
              <div class="card-item-text">${s.desktopApp}</div>
            </div>
          </div>

          <div class="card-actions">
            <a class="card-button free-button ButtonLink" href="/pages/congratulations/congratulations.html" @click="${o}">
              ${s.continueFree}
            </a>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h2 class="card-title">${s.premium}</h2>
            <div class="card-subtitle">${s.premiumPrice}</div>
          </div>

          <div class="card-items">
            ${l?c.qy`
              <div class="card-item">
                <div class="card-item-icon" role="img" aria-label="${(0,r.A)("feature_included")}">✓</div>
                <div class="card-item-text">${s.ruPremiumStable}</div>
              </div>`:""}
            <div class="card-item">
              <div class="card-item-icon" role="img" aria-label="${(0,r.A)("feature_included")}">✓</div>
              <div class="card-item-text">${s.encryption}</div>
            </div>
            <div class="card-item">
              <div class="card-item-icon" role="img" aria-label="${(0,r.A)("feature_included")}">✓</div>
              <div class="card-item-text">${s.noAds}</div>
            </div>
            <div class="card-item">
              <div class="card-item-icon" role="img" aria-label="${(0,r.A)("feature_included")}">✓</div>
              <div class="card-item-text">${s.speed}</div>
            </div>
            <div class="card-item">
              <div class="card-item-icon" role="img" aria-label="${(0,r.A)("feature_included")}">✓</div>
              <div class="card-item-text">${s.servers}</div>
            </div>
            <div class="card-item">
              <div class="card-item-icon" role="img" aria-label="${(0,r.A)("feature_included")}">✓</div>
              <div class="card-item-text">${s.desktopApp}</div>
            </div>
          </div>

          <div class="card-actions">
            <a class="card-button premium-button ButtonLink"
              aria-disabled="${!this.premiumLink}"
              href="${this.premiumLink}"
              target="_blank" rel="noopener"
              @click="${m}">
              ${s.getPremium}
            </a>
          </div>
        </div>
      </div>
    </div>
  </main>`}var u=a(680),v=a(8760),g=a(3602),b=a(9110),f=a(9845);class _ extends c.WF{render(){return p.call(this)}static get properties(){return{premiumLink:{type:String}}}constructor(){super(),this.premiumLink="",(async()=>{const e=await u.A.getStateAsync(),i=await v.A.full.userIdPromise,a=await f.Pc.getEngagedEnabledExpvarid(),t=(0,d.A)();this.premiumLink=(0,b.u4)({action:e=>Object.assign(e,{utm_source:"chromium extension",utm_medium:"congrats_tab",utm_campaign:"default_campaign"}),storeState:e,url:`${g.A.base}/${t}/orders/new?plan_id=biennial&cid=${i}`,expvarid:a})})()}}customElements.define("compare-block",_);var x=a(8131);document.title=(0,r.A)("installed_compare_title"),(async()=>{let e=await x.A.get("congrats_number")||0;e++,n.A.track("congrats_tab_open",{congrats_number:e.toString()}),await x.A.set("congrats_number",e)})(),x.A.set("installCompareShown",!0);const h=new Promise((e=>{window.addEventListener("DOMContentLoaded",(()=>{e()}))}));(async e=>{await u.A.initiate();const i=(0,d.A)();window.language=i,document.documentElement.lang=i,await h;const a=document.querySelector("div.Main > div.In");null==a||null===(e=a.append)||void 0===e||e.call(a,document.createElement("compare-block"))})()}},a={};function t(e){var r=a[e];if(void 0!==r)return r.exports;var d=a[e]={id:e,loaded:!1,exports:{}};return i[e].call(d.exports,d,d.exports,t),d.loaded=!0,d.exports}t.m=i,e=[],t.O=(i,a,r,d)=>{if(!a){var c=1/0;for(o=0;o<e.length;o++){for(var[a,r,d]=e[o],n=!0,s=0;s<a.length;s++)(!1&d||c>=d)&&Object.keys(t.O).every((e=>t.O[e](a[s])))?a.splice(s--,1):(n=!1,d<c&&(c=d));if(n){e.splice(o--,1);var l=r();void 0!==l&&(i=l)}}return i}d=d||0;for(var o=e.length;o>0&&e[o-1][2]>d;o--)e[o]=e[o-1];e[o]=[a,r,d]},t.n=e=>{var i=e&&e.__esModule?()=>e.default:()=>e;return t.d(i,{a:i}),i},t.d=(e,i)=>{for(var a in i)t.o(i,a)&&!t.o(e,a)&&Object.defineProperty(e,a,{enumerable:!0,get:i[a]})},t.g=function(){if("object"==typeof globalThis)return globalThis;try{return this||new Function("return this")()}catch(e){if("object"==typeof window)return window}}(),t.o=(e,i)=>Object.prototype.hasOwnProperty.call(e,i),t.r=e=>{"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})},t.nmd=e=>(e.paths=[],e.children||(e.children=[]),e),t.j=683,(()=>{var e={683:0};t.O.j=i=>0===e[i];var i=(i,a)=>{var r,d,[c,n,s]=a,l=0;if(c.some((i=>0!==e[i]))){for(r in n)t.o(n,r)&&(t.m[r]=n[r]);if(s)var o=s(t)}for(i&&i(a);l<c.length;l++)d=c[l],t.o(e,d)&&e[d]&&e[d][0](),e[d]=0;return t.O(o)},a=self.webpackChunkbrowsec_extension=self.webpackChunkbrowsec_extension||[];a.forEach(i.bind(null,0)),a.push=i.bind(null,a.push.bind(a))})();var r=t.O(void 0,[76],(()=>t(8775)));r=t.O(r)})();