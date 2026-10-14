import{b as F,d as R,f as A,a6 as ft,G as ct,x as lt,w as ut,o as dt,n as pt,u as H,g as mt,e as $,m as z,_ as ht,p as yt,L as gt}from"./5f867810.js";import{c as jt,g as vt}from"./107159db.js";const bt={viewBox:"0 0 24 24",width:"1.2em",height:"1.2em"};function wt(e,n){return F(),R("svg",bt,[...n[0]||(n[0]=[A("g",{fill:"currentColor"},[A("path",{d:"M15.24 2H11.3458C9.58159 1.99999 8.18418 1.99997 7.09054 2.1476C5.96501 2.29953 5.05402 2.61964 4.33559 3.34096C3.61717 4.06227 3.29833 4.97692 3.14701 6.10697C2.99997 7.205 2.99999 8.60802 3 10.3793V16.2169C3 17.725 3.91995 19.0174 5.22717 19.5592C5.15989 18.6498 5.15994 17.3737 5.16 16.312L5.16 11.3976L5.16 11.3024C5.15993 10.0207 5.15986 8.91644 5.27828 8.03211C5.40519 7.08438 5.69139 6.17592 6.4253 5.43906C7.15921 4.70219 8.06404 4.41485 9.00798 4.28743C9.88877 4.16854 10.9887 4.1686 12.2652 4.16867L12.36 4.16868H15.24L15.3348 4.16867C16.6113 4.1686 17.7088 4.16854 18.5896 4.28743C18.0627 2.94779 16.7616 2 15.24 2Z"}),A("path",{d:"M6.6001 11.3974C6.6001 8.67119 6.6001 7.3081 7.44363 6.46118C8.28716 5.61426 9.64481 5.61426 12.3601 5.61426H15.2401C17.9554 5.61426 19.313 5.61426 20.1566 6.46118C21.0001 7.3081 21.0001 8.6712 21.0001 11.3974V16.2167C21.0001 18.9429 21.0001 20.306 20.1566 21.1529C19.313 21.9998 17.9554 21.9998 15.2401 21.9998H12.3601C9.64481 21.9998 8.28716 21.9998 7.44363 21.1529C6.6001 20.306 6.6001 18.9429 6.6001 16.2167V11.3974Z"})],-1)])])}const Ct={name:"solar-copy-bold",render:wt};var V={exports:{}};/*!
 * clipboard.js v2.0.11
 * https://clipboardjs.com/
 *
 * Licensed MIT © Zeno Rocha
 */(function(e,n){(function(m,y){e.exports=y()})(jt,function(){return function(){var a={686:function(r,s,t){t.d(s,{default:function(){return st}});var f=t(279),c=t.n(f),p=t(370),v=t.n(p),b=t(817),k=t.n(b);function g(d){try{return document.execCommand(d)}catch{return!1}}var C=function(i){var o=k()(i);return g("cut"),o},j=C;function O(d){var i=document.documentElement.getAttribute("dir")==="rtl",o=document.createElement("textarea");o.style.fontSize="12pt",o.style.border="0",o.style.padding="0",o.style.margin="0",o.style.position="absolute",o.style[i?"right":"left"]="-9999px";var l=window.pageYOffset||document.documentElement.scrollTop;return o.style.top="".concat(l,"px"),o.setAttribute("readonly",""),o.value=d,o}var I=function(i,o){var l=O(i);o.container.appendChild(l);var u=k()(l);return g("copy"),l.remove(),u},Z=function(i){var o=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{container:document.body},l="";return typeof i=="string"?l=I(i,o):i instanceof HTMLInputElement&&!["text","search","url","tel","password"].includes(i?.type)?l=I(i.value,o):(l=k()(i),g("copy")),l},D=Z;function T(d){"@babel/helpers - typeof";return typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?T=function(o){return typeof o}:T=function(o){return o&&typeof Symbol=="function"&&o.constructor===Symbol&&o!==Symbol.prototype?"symbol":typeof o},T(d)}var X=function(){var i=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{},o=i.action,l=o===void 0?"copy":o,u=i.container,h=i.target,_=i.text;if(l!=="copy"&&l!=="cut")throw new Error('Invalid "action" value, use either "copy" or "cut"');if(h!==void 0)if(h&&T(h)==="object"&&h.nodeType===1){if(l==="copy"&&h.hasAttribute("disabled"))throw new Error('Invalid "target" attribute. Please use "readonly" instead of "disabled" attribute');if(l==="cut"&&(h.hasAttribute("readonly")||h.hasAttribute("disabled")))throw new Error(`Invalid "target" attribute. You can't cut text from elements with "readonly" or "disabled" attributes`)}else throw new Error('Invalid "target" value, use a valid Element');if(_)return D(_,{container:u});if(h)return l==="cut"?j(h):D(h,{container:u})},Q=X;function S(d){"@babel/helpers - typeof";return typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?S=function(o){return typeof o}:S=function(o){return o&&typeof Symbol=="function"&&o.constructor===Symbol&&o!==Symbol.prototype?"symbol":typeof o},S(d)}function W(d,i){if(!(d instanceof i))throw new TypeError("Cannot call a class as a function")}function J(d,i){for(var o=0;o<i.length;o++){var l=i[o];l.enumerable=l.enumerable||!1,l.configurable=!0,"value"in l&&(l.writable=!0),Object.defineProperty(d,l.key,l)}}function tt(d,i,o){return i&&J(d.prototype,i),o&&J(d,o),d}function et(d,i){if(typeof i!="function"&&i!==null)throw new TypeError("Super expression must either be null or a function");d.prototype=Object.create(i&&i.prototype,{constructor:{value:d,writable:!0,configurable:!0}}),i&&M(d,i)}function M(d,i){return M=Object.setPrototypeOf||function(l,u){return l.__proto__=u,l},M(d,i)}function nt(d){var i=at();return function(){var l=P(d),u;if(i){var h=P(this).constructor;u=Reflect.construct(l,arguments,h)}else u=l.apply(this,arguments);return rt(this,u)}}function rt(d,i){return i&&(S(i)==="object"||typeof i=="function")?i:ot(d)}function ot(d){if(d===void 0)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return d}function at(){if(typeof Reflect>"u"||!Reflect.construct||Reflect.construct.sham)return!1;if(typeof Proxy=="function")return!0;try{return Date.prototype.toString.call(Reflect.construct(Date,[],function(){})),!0}catch{return!1}}function P(d){return P=Object.setPrototypeOf?Object.getPrototypeOf:function(o){return o.__proto__||Object.getPrototypeOf(o)},P(d)}function B(d,i){var o="data-clipboard-".concat(d);if(i.hasAttribute(o))return i.getAttribute(o)}var it=function(d){et(o,d);var i=nt(o);function o(l,u){var h;return W(this,o),h=i.call(this),h.resolveOptions(u),h.listenClick(l),h}return tt(o,[{key:"resolveOptions",value:function(){var u=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};this.action=typeof u.action=="function"?u.action:this.defaultAction,this.target=typeof u.target=="function"?u.target:this.defaultTarget,this.text=typeof u.text=="function"?u.text:this.defaultText,this.container=S(u.container)==="object"?u.container:document.body}},{key:"listenClick",value:function(u){var h=this;this.listener=v()(u,"click",function(_){return h.onClick(_)})}},{key:"onClick",value:function(u){var h=u.delegateTarget||u.currentTarget,_=this.action(h)||"copy",L=Q({action:_,container:this.container,target:this.target(h),text:this.text(h)});this.emit(L?"success":"error",{action:_,text:L,trigger:h,clearSelection:function(){h&&h.focus(),window.getSelection().removeAllRanges()}})}},{key:"defaultAction",value:function(u){return B("action",u)}},{key:"defaultTarget",value:function(u){var h=B("target",u);if(h)return document.querySelector(h)}},{key:"defaultText",value:function(u){return B("text",u)}},{key:"destroy",value:function(){this.listener.destroy()}}],[{key:"copy",value:function(u){var h=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{container:document.body};return D(u,h)}},{key:"cut",value:function(u){return j(u)}},{key:"isSupported",value:function(){var u=arguments.length>0&&arguments[0]!==void 0?arguments[0]:["copy","cut"],h=typeof u=="string"?[u]:u,_=!!document.queryCommandSupported;return h.forEach(function(L){_=_&&!!document.queryCommandSupported(L)}),_}}]),o}(c()),st=it},828:function(r){var s=9;if(typeof Element<"u"&&!Element.prototype.matches){var t=Element.prototype;t.matches=t.matchesSelector||t.mozMatchesSelector||t.msMatchesSelector||t.oMatchesSelector||t.webkitMatchesSelector}function f(c,p){for(;c&&c.nodeType!==s;){if(typeof c.matches=="function"&&c.matches(p))return c;c=c.parentNode}}r.exports=f},438:function(r,s,t){var f=t(828);function c(b,k,g,C,j){var O=v.apply(this,arguments);return b.addEventListener(g,O,j),{destroy:function(){b.removeEventListener(g,O,j)}}}function p(b,k,g,C,j){return typeof b.addEventListener=="function"?c.apply(null,arguments):typeof g=="function"?c.bind(null,document).apply(null,arguments):(typeof b=="string"&&(b=document.querySelectorAll(b)),Array.prototype.map.call(b,function(O){return c(O,k,g,C,j)}))}function v(b,k,g,C){return function(j){j.delegateTarget=f(j.target,k),j.delegateTarget&&C.call(b,j)}}r.exports=p},879:function(r,s){s.node=function(t){return t!==void 0&&t instanceof HTMLElement&&t.nodeType===1},s.nodeList=function(t){var f=Object.prototype.toString.call(t);return t!==void 0&&(f==="[object NodeList]"||f==="[object HTMLCollection]")&&"length"in t&&(t.length===0||s.node(t[0]))},s.string=function(t){return typeof t=="string"||t instanceof String},s.fn=function(t){var f=Object.prototype.toString.call(t);return f==="[object Function]"}},370:function(r,s,t){var f=t(879),c=t(438);function p(g,C,j){if(!g&&!C&&!j)throw new Error("Missing required arguments");if(!f.string(C))throw new TypeError("Second argument must be a String");if(!f.fn(j))throw new TypeError("Third argument must be a Function");if(f.node(g))return v(g,C,j);if(f.nodeList(g))return b(g,C,j);if(f.string(g))return k(g,C,j);throw new TypeError("First argument must be a String, HTMLElement, HTMLCollection, or NodeList")}function v(g,C,j){return g.addEventListener(C,j),{destroy:function(){g.removeEventListener(C,j)}}}function b(g,C,j){return Array.prototype.forEach.call(g,function(O){O.addEventListener(C,j)}),{destroy:function(){Array.prototype.forEach.call(g,function(O){O.removeEventListener(C,j)})}}}function k(g,C,j){return c(document.body,g,C,j)}r.exports=p},817:function(r){function s(t){var f;if(t.nodeName==="SELECT")t.focus(),f=t.value;else if(t.nodeName==="INPUT"||t.nodeName==="TEXTAREA"){var c=t.hasAttribute("readonly");c||t.setAttribute("readonly",""),t.select(),t.setSelectionRange(0,t.value.length),c||t.removeAttribute("readonly"),f=t.value}else{t.hasAttribute("contenteditable")&&t.focus();var p=window.getSelection(),v=document.createRange();v.selectNodeContents(t),p.removeAllRanges(),p.addRange(v),f=p.toString()}return f}r.exports=s},279:function(r){function s(){}s.prototype={on:function(t,f,c){var p=this.e||(this.e={});return(p[t]||(p[t]=[])).push({fn:f,ctx:c}),this},once:function(t,f,c){var p=this;function v(){p.off(t,v),f.apply(c,arguments)}return v._=f,this.on(t,v,c)},emit:function(t){var f=[].slice.call(arguments,1),c=((this.e||(this.e={}))[t]||[]).slice(),p=0,v=c.length;for(p;p<v;p++)c[p].fn.apply(c[p].ctx,f);return this},off:function(t,f){var c=this.e||(this.e={}),p=c[t],v=[];if(p&&f)for(var b=0,k=p.length;b<k;b++)p[b].fn!==f&&p[b].fn._!==f&&v.push(p[b]);return v.length?c[t]=v:delete c[t],this}},r.exports=s,r.exports.TinyEmitter=s}},m={};function y(r){if(m[r])return m[r].exports;var s=m[r]={exports:{}};return a[r](s,s.exports,y),s.exports}return function(){y.n=function(r){var s=r&&r.__esModule?function(){return r.default}:function(){return r};return y.d(s,{a:s}),s}}(),function(){y.d=function(r,s){for(var t in s)y.o(s,t)&&!y.o(r,t)&&Object.defineProperty(r,t,{enumerable:!0,get:s[t]})}}(),function(){y.o=function(r,s){return Object.prototype.hasOwnProperty.call(r,s)}}(),y(686)}().default})})(V);var kt=V.exports;const xt=vt(kt),_t=e=>{const n=e?.appendToBody===void 0?!0:e.appendToBody;return{toClipboard(a,m){return new Promise((y,r)=>{const s=document.createElement("button"),t=new xt(s,{text:()=>a,action:()=>"copy",container:m!==void 0?m:document.body});t.on("success",f=>{t.destroy(),y(f)}),t.on("error",f=>{t.destroy(),r(f)}),n&&document.body.appendChild(s),s.click(),n&&document.body.removeChild(s)})}}};function U(e){return e===null?"null":typeof e}function q(e){return!!e&&typeof e=="object"}function G(e){if(e===void 0)return"";if(e===null)return"Object";if(typeof e=="object"&&!e.constructor)return"{ x props }";var n=/function ([^(]*)/.exec(e.constructor.toString());return n&&n.length>1?n[1]:""}function Y(e,n,a){return e==="null"||e==="undefined"?e:(e!=="string"&&e!=="stringifiable"||(a='"'+(a.replace(/"/g,'\\"')+'"')),e==="function"?n.toString().replace(/[\r\n]/g,"").replace(/\{.*\}/,"")+"{…}":a)}function K(e){var n="";return q(e)?(n=G(e),Array.isArray(e)&&(n+="["+e.length+"]")):n=Y(U(e),e,e),n}function x(e){return"json-formatter-"+e}function w(e,n,a){var m=document.createElement(e);return n&&m.classList.add(x(n)),a!==void 0&&(a instanceof Node?m.appendChild(a):m.appendChild(document.createTextNode(String(a)))),m}(function(e){if(e&&typeof window<"u"){var n=document.createElement("style");n.setAttribute("media","screen"),n.innerHTML=e,document.head.appendChild(n)}})(`.json-formatter-row {
  font-family: monospace;
}
.json-formatter-row,
.json-formatter-row a,
.json-formatter-row a:hover {
  color: black;
  text-decoration: none;
}
.json-formatter-row .json-formatter-row {
  margin-left: 1rem;
}
.json-formatter-row .badge {
  display: inline-block;
}
.json-formatter-row .json-formatter-open > .json-formatter-children.json-formatter-object > .json-formatter-badge {
  display: none;
}
.json-formatter-row .json-formatter-children.json-formatter-empty {
  opacity: 0.5;
  margin-left: 1rem;
}
.json-formatter-row .json-formatter-children.json-formatter-empty:after {
  display: none;
}
.json-formatter-row .json-formatter-children.json-formatter-empty.json-formatter-object:after {
  content: "";
}
.json-formatter-row .json-formatter-children.json-formatter-empty.json-formatter-array:after {
  content: "";
}
.json-formatter-row .json-formatter-string,
.json-formatter-row .json-formatter-stringifiable {
  color: #04a004;
  white-space: pre;
  word-wrap: break-word;
}
.json-formatter-row .json-formatter-number {
  color: blue;
}
.json-formatter-row .json-formatter-boolean {
  color: red;
}
.json-formatter-row .json-formatter-null {
  color: #855A00;
}
.json-formatter-row .json-formatter-undefined {
  color: #ca0b69;
}
.json-formatter-row .json-formatter-function {
  color: #FF20ED;
}
.json-formatter-row .json-formatter-date {
  background-color: rgba(0, 0, 0, 0.05);
}
.json-formatter-row .json-formatter-url {
  text-decoration: underline;
  color: blue;
  cursor: pointer;
}
.json-formatter-row .json-formatter-bracket {
  color: blue;
}
.json-formatter-row .json-formatter-key {
  color: #3d00a0;
  padding-right: 0.2rem;
}
.json-formatter-row .json-formatter-toggler-link {
  cursor: pointer;
}
.json-formatter-row .json-formatter-toggler {
  line-height: 1.2rem;
  font-size: 0.9rem;
  vertical-align: middle;
  opacity: 0.6;
  cursor: pointer;
  padding-right: 0.2rem;
}
.json-formatter-row .json-formatter-toggler:after {
  display: inline-block;
  transition: transform 100ms ease-in;
  content: "►";
}
.json-formatter-row > a > .json-formatter-preview-text > .json-formatter-value {
  opacity: 0;
  transition: opacity 0.15s ease-in;
  font-style: italic;
}
.json-formatter-row:hover > a > .json-formatter-preview-text {
  opacity: 0.6;
}
.json-formatter-row.json-formatter-open > a.json-formatter-toggler-link > .json-formatter-value .json-formatter-badge {
  display: none;
}
.json-formatter-row.json-formatter-open > .json-formatter-object:after {
  content: '}';
}
.json-formatter-row.json-formatter-open > .json-formatter-array:after {
  content: ']';
}
.json-formatter-row.json-formatter-open > .json-formatter-toggler-link .json-formatter-toggler:after {
  transform: rotate(90deg);
}
.json-formatter-row.json-formatter-open > * > .json-formatter-badge {
  display: none;
}
.json-formatter-row.json-formatter-open > .json-formatter-children:after {
  display: inline-block;
}
.json-formatter-row.json-formatter-open > a > .json-formatter-preview-text {
  display: none;
}
.json-formatter-row.json-formatter-open.json-formatter-empty:after {
  display: block;
}
.json-formatter-dark.json-formatter-row {
  font-family: monospace;
}
.json-formatter-dark.json-formatter-row,
.json-formatter-dark.json-formatter-row a,
.json-formatter-dark.json-formatter-row a:hover {
  color: white;
  text-decoration: none;
}
.json-formatter-dark.json-formatter-row .json-formatter-row {
  margin-left: 1rem;
}
.json-formatter-dark.json-formatter-row .badge {
  display: inline-block;
}
.json-formatter-dark.json-formatter-row .json-formatter-open > .json-formatter-children.json-formatter-object > .json-formatter-badge {
  display: none;
}
.json-formatter-dark.json-formatter-row .json-formatter-children.json-formatter-empty {
  opacity: 0.5;
  margin-left: 1rem;
}
.json-formatter-dark.json-formatter-row .json-formatter-children.json-formatter-empty:after {
  display: none;
}
.json-formatter-dark.json-formatter-row .json-formatter-children.json-formatter-empty.json-formatter-object:after {
  content: "";
}
.json-formatter-dark.json-formatter-row .json-formatter-children.json-formatter-empty.json-formatter-array:after {
  content: "";
}
.json-formatter-dark.json-formatter-row .json-formatter-string,
.json-formatter-dark.json-formatter-row .json-formatter-stringifiable {
  color: #31F031;
  white-space: pre;
  word-wrap: break-word;
}
.json-formatter-dark.json-formatter-row .json-formatter-number {
  color: #66C2FF;
}
.json-formatter-dark.json-formatter-row .json-formatter-boolean {
  color: #EC4242;
}
.json-formatter-dark.json-formatter-row .json-formatter-null {
  color: #EEC97D;
}
.json-formatter-dark.json-formatter-row .json-formatter-undefined {
  color: #ef8fbe;
}
.json-formatter-dark.json-formatter-row .json-formatter-function {
  color: #FD48CB;
}
.json-formatter-dark.json-formatter-row .json-formatter-date {
  background-color: rgba(255, 255, 255, 0.05);
}
.json-formatter-dark.json-formatter-row .json-formatter-url {
  text-decoration: underline;
  color: #027BFF;
  cursor: pointer;
}
.json-formatter-dark.json-formatter-row .json-formatter-bracket {
  color: #9494FF;
}
.json-formatter-dark.json-formatter-row .json-formatter-key {
  color: #23A0DB;
  padding-right: 0.2rem;
}
.json-formatter-dark.json-formatter-row .json-formatter-toggler-link {
  cursor: pointer;
}
.json-formatter-dark.json-formatter-row .json-formatter-toggler {
  line-height: 1.2rem;
  font-size: 0.9rem;
  vertical-align: middle;
  opacity: 0.6;
  cursor: pointer;
  padding-right: 0.2rem;
}
.json-formatter-dark.json-formatter-row .json-formatter-toggler:after {
  display: inline-block;
  transition: transform 100ms ease-in;
  content: "►";
}
.json-formatter-dark.json-formatter-row > a > .json-formatter-preview-text > .json-formatter-value {
  opacity: 0;
  transition: opacity 0.15s ease-in;
  font-style: italic;
}
.json-formatter-dark.json-formatter-row:hover > a > .json-formatter-preview-text {
  opacity: 0.6;
}
.json-formatter-dark.json-formatter-row.json-formatter-open > a.json-formatter-toggler-link > .json-formatter-value .json-formatter-badge {
  display: none;
}
.json-formatter-dark.json-formatter-row.json-formatter-open > .json-formatter-object:after {
  content: '}';
}
.json-formatter-dark.json-formatter-row.json-formatter-open > .json-formatter-array:after {
  content: ']';
}
.json-formatter-dark.json-formatter-row.json-formatter-open > .json-formatter-toggler-link .json-formatter-toggler:after {
  transform: rotate(90deg);
}
.json-formatter-dark.json-formatter-row.json-formatter-open > * > .json-formatter-badge {
  display: none;
}
.json-formatter-dark.json-formatter-row.json-formatter-open > .json-formatter-children:after {
  display: inline-block;
}
.json-formatter-dark.json-formatter-row.json-formatter-open > a > .json-formatter-preview-text {
  display: none;
}
.json-formatter-dark.json-formatter-row.json-formatter-open.json-formatter-empty:after {
  display: block;
}
`);var Ot=/(^\d{1,4}[\.|\\/|-]\d{1,2}[\.|\\/|-]\d{1,4})(\s*(?:0?[1-9]:[0-5]|1(?=[012])\d:[0-5])\d\s*[ap]m)?$/,At=/\d{2}:\d{2}:\d{2} GMT-\d{4}/,Et=/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/,N=window.requestAnimationFrame||function(e){return e(),0},E={hoverPreviewEnabled:!1,hoverPreviewArrayCount:100,hoverPreviewFieldCount:5,animateOpen:!0,animateClose:!0,theme:null,useToJSON:!0,sortPropertiesBy:null,maxArrayItems:100,exposePath:!1,showBadge:!1,name:null},St=function(){function e(n,a,m,y,r,s,t){a===void 0&&(a=1),m===void 0&&(m=E),s===void 0&&(s=[]),this.json=n,this.open=a,this.config=m,this.key=y,this.displayKey=r,this.path=s,this.arrayRange=t,this._isOpen=null,this.config.hoverPreviewEnabled===void 0&&(this.config.hoverPreviewEnabled=E.hoverPreviewEnabled),this.config.hoverPreviewArrayCount===void 0&&(this.config.hoverPreviewArrayCount=E.hoverPreviewArrayCount),this.config.hoverPreviewFieldCount===void 0&&(this.config.hoverPreviewFieldCount=E.hoverPreviewFieldCount),this.config.useToJSON===void 0&&(this.config.useToJSON=E.useToJSON),this.config.maxArrayItems===void 0&&(this.config.maxArrayItems=E.maxArrayItems),this.key===""&&(this.key='""'),this.displayKey===void 0&&(this.displayKey=this.key)}return Object.defineProperty(e.prototype,"isOpen",{get:function(){return this._isOpen!==null?this._isOpen:this.open>0},set:function(n){this._isOpen=n},enumerable:!0,configurable:!0}),Object.defineProperty(e.prototype,"isDate",{get:function(){return this.json instanceof Date||this.type==="string"&&(Ot.test(this.json)||Et.test(this.json)||At.test(this.json))},enumerable:!0,configurable:!0}),Object.defineProperty(e.prototype,"isUrl",{get:function(){return this.type==="string"&&this.json.indexOf("http")===0},enumerable:!0,configurable:!0}),Object.defineProperty(e.prototype,"isArray",{get:function(){return Array.isArray(this.json)},enumerable:!0,configurable:!0}),Object.defineProperty(e.prototype,"isLargeArray",{get:function(){return this.isArray&&this.json.length>this.config.maxArrayItems},enumerable:!0,configurable:!0}),Object.defineProperty(e.prototype,"isArrayRange",{get:function(){return this.isArray&&this.arrayRange!==void 0&&this.arrayRange.length===2},enumerable:!0,configurable:!0}),Object.defineProperty(e.prototype,"isObject",{get:function(){return q(this.json)},enumerable:!0,configurable:!0}),Object.defineProperty(e.prototype,"isEmptyObject",{get:function(){return!this.keys.length&&!this.isArray},enumerable:!0,configurable:!0}),Object.defineProperty(e.prototype,"isEmpty",{get:function(){return this.isEmptyObject||this.keys&&!this.keys.length&&this.isArray},enumerable:!0,configurable:!0}),Object.defineProperty(e.prototype,"useToJSON",{get:function(){return this.config.useToJSON&&this.type==="stringifiable"},enumerable:!0,configurable:!0}),Object.defineProperty(e.prototype,"hasKey",{get:function(){return this.key!==void 0},enumerable:!0,configurable:!0}),Object.defineProperty(e.prototype,"constructorName",{get:function(){return G(this.json)},enumerable:!0,configurable:!0}),Object.defineProperty(e.prototype,"type",{get:function(){return this.config.useToJSON&&this.json&&this.json.toJSON?"stringifiable":U(this.json)},enumerable:!0,configurable:!0}),Object.defineProperty(e.prototype,"keys",{get:function(){if(this.isObject){var n=Object.keys(this.json);if(this.isLargeArray){var a=Math.ceil(this.json.length/this.config.maxArrayItems);n=[];for(var m=0;m<a;m++){var y=m*this.config.maxArrayItems,r=Math.min(this.json.length-1,y+(this.config.maxArrayItems-1));n.push(y+" … "+r)}}return!this.isArray&&this.config.sortPropertiesBy?n.sort(this.config.sortPropertiesBy):n}return[]},enumerable:!0,configurable:!0}),e.prototype.toggleOpen=function(){this.isOpen=!this.isOpen,this.element&&(this.isOpen?this.appendChildren(this.config.animateOpen):this.removeChildren(this.config.animateClose),this.element.classList.toggle(x("open")))},e.prototype.openAtDepth=function(n){n===void 0&&(n=1),n<0||(this.open=n,this.isOpen=n!==0,this.element&&(this.removeChildren(!1),n===0?this.element.classList.remove(x("open")):(this.appendChildren(this.config.animateOpen),this.element.classList.add(x("open")))))},e.prototype.getInlinepreview=function(){var n=this;if(this.isArray)return this.json.length>this.config.hoverPreviewArrayCount?"Array["+this.json.length+"]":"["+this.json.map(K).join(", ")+"]";var a=this.keys,m=a.slice(0,this.config.hoverPreviewFieldCount).map(function(r){return r+":"+K(n.json[r])}),y=a.length>=this.config.hoverPreviewFieldCount?"…":"";return"{"+m.join(", ")+y+"}"},e.prototype.render=function(){this.element=w("div","row");var n=this.isObject?w("a","toggler-link"):w("span");if(this.isObject&&!this.useToJSON&&n.appendChild(w("span","toggler")),this.isArrayRange?n.appendChild(w("span","range","["+this.displayKey+"]")):this.hasKey&&(n.appendChild(w("span","key",this.displayKey+":")),this.config.exposePath&&(this.element.dataset.path=JSON.stringify(this.path))),this.isObject&&!this.useToJSON){var a=w("span","value"),m=w("span");if(!this.isArrayRange&&!this.isArray){var y=w("span","{");m.appendChild(y)}if(this.isObject&&!this.isArray&&((r=w("span")).appendChild(w("span","","{")),this.config.showBadge&&((s=w("span","",Object.keys(this.json).length+" props")).className="bg-slate-200/60 mx-0.5 px-1 py-0.5 rounded text-xs text-slate-100 json-formatter-badge dark:bg-slate-700",r.appendChild(s)),r.appendChild(w("span","badge","}")),m.appendChild(r)),this.isArray&&!this.isArrayRange){var r,s;(r=w("span")).appendChild(w("span","","[")),this.config.showBadge&&((s=w("span","",this.json.length+" items")).className="bg-slate-200/60 mx-0.5 px-1 py-0.5 rounded text-xs text-slate-100 json-formatter-badge dark:bg-slate-700",r.appendChild(s)),r.appendChild(w("span","badge","]")),m.appendChild(r)}a.appendChild(m),n.appendChild(a)}else{(a=this.isUrl?w("a"):w("span")).classList.add(x(this.type)),this.isDate&&a.classList.add(x("date"));var t=Y(this.type,this.json,this.useToJSON?this.json.toJSON():this.json);a.appendChild(document.createTextNode(t)),n.appendChild(a)}if(this.isObject&&this.config.hoverPreviewEnabled){var f=w("span","preview-text");f.appendChild(document.createTextNode(this.getInlinepreview())),n.appendChild(f)}var c=w("div","children");return this.isObject&&c.classList.add(x("object")),this.isArray&&c.classList.add(x("array")),this.isEmpty&&c.classList.add(x("empty")),this.config&&this.config.theme&&this.element.classList.add(x(this.config.theme)),this.isOpen&&this.element.classList.add(x("open")),this.element.appendChild(n),this.element.appendChild(c),this.isObject&&this.isOpen&&this.appendChildren(),this.isObject&&!this.useToJSON&&n.addEventListener("click",this.toggleOpen.bind(this)),this.element},e.prototype.appendChildren=function(n){var a=this;n===void 0&&(n=!1);var m=this.element.querySelector("div."+x("children"));if(m&&!this.isEmpty){var y=function(t,f){var c=a.isLargeArray?[f*a.config.maxArrayItems,Math.min(a.json.length-1,f*a.config.maxArrayItems+(a.config.maxArrayItems-1))]:void 0,p=a.isArrayRange?(a.arrayRange[0]+f).toString():t,v=new e(c?a.json.slice(c[0],c[1]+1):a.json[t],a.open-1,a.config,t,p,c?a.path:a.path.concat(p),c);m.appendChild(v.render())};if(n){var r=0,s=function(){var t=a.keys[r];y(t,r),(r+=1)<a.keys.length&&(r>10?s():N(s))};N(s)}else this.keys.forEach(function(t,f){return y(t,f)})}},e.prototype.removeChildren=function(n){n===void 0&&(n=!1);var a=this.element.querySelector("div."+x("children"));if(n){var m=0,y=function(){a&&a.children.length&&(a.removeChild(a.children[0]),(m+=1)>10?y():N(y))};N(y)}else a&&(a.innerHTML="")},e}();const Tt={class:"bg-slate-50 dark:bg-slate-800/80"},Pt={class:"relative"},Lt={key:0,class:"flex items-center text-xs border-r border-slate-700 px-2 text-slate-800 mr-2 pt-0.5 dark:text-white"},Jt={__name:"ObjectExplorer",props:{data:{type:Object,default:()=>{},required:!0},name:{type:String,default:"Object"},openLevel:{type:Number,default:2},showBadge:{type:Boolean,default:!0}},setup(e){const n=e,a=ft(),m=ct("events"),{toClipboard:y}=_t(),r=z(!1);async function s(){m.emit({name:"ga4Event",detail:{event:"copy_to_clipboard",copy_object_name:n?.name?.toLowerCase()??"(not set)"}});try{await y(JSON.stringify(n.data)),r.value=!0,setTimeout(()=>{r.value=!1},2e3)}catch{}}const t=z(null),f=lt();function c(p){r.value=!1;const v=new St(p,n.openLevel||f?.settings?.ui?.objectOpenDepth,{hoverPreviewEnabled:!1,hoverPreviewArrayCount:100,hoverPreviewFieldCount:5,theme:a.value?"dark":"",animateOpen:!1,animateClose:!1,useToJSON:!1,maxArrayItems:300,exposePath:!0,showBadge:n.showBadge,name:(n.name==="","")});t.value.replaceChild(v.render(),t.value.childNodes[0])}return ut(()=>n.data,p=>{c(p)}),dt(()=>{c(n.data)}),(p,v)=>{const b=Ct,k=ht;return F(),R("div",Tt,[A("div",Pt,[A("button",{title:"Copy to clipboard",class:pt(["flex transition-opacity duration-1000 ease-out absolute z-20 right-1.5 top-1 rounded font-bold hover:cursor-pointer dark:bg-slate-500 bg-slate-300 px-1 py-1.5 hover:opacity-60",H(r)?"opacity-60 ":"opacity-20 "]),onClick:s},[H(r)?(F(),R("span",Lt,"Copied")):mt("",!0),$(b,{class:"flex dark:text-white hover:dark:text-black"})],2)]),A("div",{ref_key:"jsonData",ref:t,class:"px-2 py-2 antialiased tracking-tight dark:bg-slate-800 antialiased tracking-tight overflow-auto"},[$(k)],512)])}}},Nt={},Ft={class:"cursor-pointer truncate"},Rt={class:"flex h-9 shadow-xl"};function Dt(e,n){return F(),R("li",Ft,[A("div",Rt,[gt(e.$slots,"main")])])}const Ht=yt(Nt,[["render",Dt]]);export{Ht as _,Jt as a};
