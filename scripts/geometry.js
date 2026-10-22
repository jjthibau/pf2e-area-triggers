import {ID,profileFor,profilesFor,profiles,slug,esc} from './profiles.js';
const radiusPatches=new WeakMap();
let localAuraCaches=new WeakMap();
export function invalidateLocalAuraCaches(){localAuraCaches=new WeakMap();}
// A scoped native aura enumerates only squares near the target. Native distance,
// source polygons, wall type and covered-square tests remain unchanged.
export function targetLocalAura(marker,radius){
 return {traits:marker.traits,containsToken(target){const candidate=new marker.constructor({...marker,radius}),full=candidate.bounds,b=target.mechanicalBounds,size=marker.scene.grid.size,span=Math.min(full.width,Math.max(Math.ceil((b.width+2*size)/size),Math.ceil((b.height+2*size)/size))*size),x=Math.clamp(full.x+Math.floor((b.x-full.x)/size)*size-size,full.x,full.right-span),y=Math.clamp(full.y+Math.floor((b.y-full.y)/size)*size-size,full.y,full.bottom-span),token=marker.token,key=[radius,token.x,token.y,token.elevation,token.width,token.height,token._source.level,x,y,span].join(':');let cache=localAuraCaches.get(marker);if(!cache){cache=new Map();localAuraCaches.set(marker,cache);}let aura=cache.get(key);if(!aura){Object.defineProperty(candidate,'bounds',{value:new PIXI.Rectangle(x,y,span,span)});aura=candidate;if(cache.size>=256)cache.clear();cache.set(key,aura);}return aura.containsToken(target);}};
}
// A movement probe is a detached native token, not a Scene token. Reuse it
// across path samples and undo the native Actor dependency registration.
export function movementProbe(token){
 const fields=['x','y','elevation','width','height','depth','shape'],base=Object.fromEntries(fields.map(key=>[key,token[key]]));
 const data=foundry.utils.deepClone({...token._source,_id:foundry.utils.randomID(),_movementHistory:[]});
 const document=new token.constructor(data,{parent:token.parent});
 return {document,at(position){document.updateSource({...base,...Object.fromEntries(fields.filter(key=>position[key]!==undefined).map(key=>[key,position[key]]))});document.object?.position.set(document.x,document.y);return document;},dispose(){const baseActor=document.baseActor,actor=document.actor;try{document._object?.destroy({children:true});}finally{baseActor?._unregisterDependentToken(document);if(actor!==baseActor)actor?._unregisterDependentToken(document);}}};
}
// Scoped source corrections retain native TokenAura geometry and renderers.
// Item documents and native prototypes are never changed.
export function repairAuraRadii(token){
 if(!game.settings.get(ID,'enabled')||!token.actor||!token.auras?.size)return;
 for(const item of token.actor.items)for(const p of profilesFor(item)){
  const c=p.radiusCorrection;if(!c)continue;const name=p.auraSlug??slug(item),aura=token.auras.get(name);
  if(!aura||aura.radius!==c.prepared||!token.actor.rules.some(r=>r.key==='Aura'&&r.item.id===item.id&&(r.slug??slug(item))===name&&r.radius===c.source&&r.test()))continue;
  const patched=new aura.constructor({...aura,radius:c.radius}),records=radiusPatches.get(token)??new Map();records.set(name,{original:aura,patched});radiusPatches.set(token,records);token.auras.set(name,patched);token.object?.auras?.reset([name]);
 }
}
export function restoreAuraRadii(){
 for(const scene of game.scenes)for(const token of scene.tokens){const records=radiusPatches.get(token);if(!records)continue;const changed=[];for(const [name,r] of records)if(token.auras.get(name)===r.patched){token.auras.set(name,new r.original.constructor({...r.original}));changed.push(name);}radiusPatches.delete(token);if(changed.length)token.object?.auras?.reset(changed);}
}
export function sourceActive(item,p=profileFor(item)){
 if(!p||item.isOfType('effect')&&item.isExpired)return false;
 if(p.requiresEffect&&!item.actor?.itemTypes.effect.some(e=>!e.isExpired&&e.sourceId===p.requiresEffect))return false;
 const active=item.getFlag(ID,'active');return p.activation!=='manual'||active?.enabled&&(!active.expiresAt||active.expiresAt>game.time.worldTime);
}
export async function ensureGeometry(scene=canvas.scene){
 if(!game.user.isActiveGM||!scene)return;
 for(const token of scene.tokens)repairAuraRadii(token);
 const actors=[...new Map(scene.tokens.filter(t=>t.actor).map(t=>[t.actor.uuid,t.actor])).values()];
 for(const actor of actors){
  for(const effect of [...actor.itemTypes.effect]){const marker=effect.getFlag(ID,'geometry');if(!marker)continue;const source=actor.items.get(marker.itemId),p=source&&profileFor(source);if(!source||(!p?.geometry&&!p?.nativeRollOptionAliases)||!sourceActive(source,p))await effect.delete();}
  for(const item of [...actor.items]){const p=profileFor(item);if((!p?.geometry&&!p?.nativeRollOptionAliases)||p.geometry?.kind==='space'||!sourceActive(item,p))continue;
   if(actor.itemTypes.effect.some(e=>e.getFlag(ID,'geometry')?.itemId===item.id))continue;
   await actor.createEmbeddedDocuments('Item',[{name:'Area: '+item.name,type:'effect',img:item.img,system:{duration:{value:-1,unit:'unlimited'},tokenIcon:{show:false},rules:[...(p.geometry?[{key:'Aura',slug:p.auraSlug,radius:p.geometry.localCoverage?5:p.geometry.radius,traits:p.geometry.traits??[],...(p.geometry.localCoverage?{appearance:{border:{color:'#000000',alpha:0},highlight:{color:'#000000',alpha:0},texture:null}}:{}),...(p.geometry.predicate?{predicate:p.geometry.predicate}:{})}]:[]),...(p.nativeRollOptionAliases??[]).map(a=>({key:'RollOption',domain:'all',option:a.to,predicate:[a.from]}))]},flags:{[ID]:{geometry:{itemId:item.id,profile:p.id}}}}]);
  }
 }
}
export async function clearGeometry(){
 if(!game.user.isActiveGM)return;
 for(const actor of new Set([...game.actors,...game.scenes.contents.flatMap(s=>s.tokens.map(t=>t.actor).filter(Boolean))])){const ids=actor.itemTypes.effect.filter(e=>e.getFlag(ID,'geometry')).map(e=>e.id);if(ids.length)await actor.deleteEmbeddedDocuments('Item',ids);}
}
export async function setActive(itemUUID,enabled){
 const item=await fromUuid(itemUUID),p=item&&profileFor(item);if(!item||!p||!item.isOwner)throw Error('Only the source owner or GM can activate this area.');
 await item.setFlag(ID,'active',{enabled:!!enabled,expiresAt:enabled&&p.duration?game.time.worldTime+p.duration:null});
}
export function footprintAura(token){
 return {traits:[],containsToken:target=>!target.hidden&&!!token.object&&!!target.object&&token.mechanicalBounds.intersects(target.mechanicalBounds)&&token.object.distanceTo(target.object)===0};
}

export const environmentLabels=Object.freeze({'torch-fire-proximity':'Within30feet of a fire at least torch-sized','nonsolid-surface':'Above a nonsolid surface','no-adjacent-solid':'No adjacent solid object or surface of sufficient size','excess-flight-height':'More than5feet above the local ground','magical-darkness':'Magical darkness','magical-light':'Magical light','bright-light':'Bright light','electricity-damage':'Area dealing electricity damage','salt-water-immersion':'Full immersion in salt water','music-proximity':'Within 30 feet of music','lit-incense-adjacency':'Adjacent to lit incense','mirror-adjacency':'Adjacent to a mirror','rain':'Rain','shelter':'Shelter'});
export function environmentTagsFor(region){const auto=region.getFlag(ID,'environmentBinding');return [...new Set([...(region.getFlag(ID,'environmentTags')??[]),...(auto&&(!auto.expiresAt||auto.expiresAt>game.time.worldTime)?auto.tags:[])])];}
export async function setEnvironmentTags(regionUUID,tags){const region=await fromUuid(regionUUID);if(!game.user.isGM||region?.documentName!=='Region')throw Error('Only the GM can mark environmental exposure areas.');if(!Array.isArray(tags)||tags.some(tag=>!Object.hasOwn(environmentLabels,tag)))throw Error('Choose the listed environmental exposures.');await region.setFlag(ID,'environmentTags',[...new Set(tags)]);}
export function renderEnvironmentConfig(app,root){if(!game.user.isGM)return;const region=app.document,area=root.querySelector('[data-tab="appearance"]');if(region?.documentName!=='Region'||!area)return;area.querySelector('[data-area-environment]')?.remove();const fieldset=document.createElement('fieldset'),selected=region.getFlag(ID,'environmentTags')??[];fieldset.dataset.areaEnvironment='';fieldset.innerHTML='<legend>PF2e Area Triggers</legend><div class="form-group"><label>Area counts as</label><div class="form-fields"><multi-select name="flags.'+ID+'.environmentTags">'+Object.entries(environmentLabels).map(([key,label])=>'<option value="'+key+'" '+(selected.includes(key)?'selected':'')+'>'+esc(label)+'</option>').join('')+'</multi-select></div><p class="hint">Mark the actual exposure area. Proximity choices include the stated distance; salt water means full immersion. Native geometry and elevation determine who is inside.</p></div>';area.append(fieldset);}

export function eventContains(region,target,event){
 if(target.testInsideRegion(region))return true;const source=region.getFlag(ID,'binding'),p=profiles[source?.profile],feet=p?.eventBufferFeet?.[event];if(!feet)return false;
 if(p.bufferFamily&&region.parent.regions.some(r=>{const s=r.getFlag(ID,'binding');return s?.castKey===source.castKey&&s.profile===p.bufferFamily+'-adjacent';}))return false;
 const scale=region.parent.grid.size/region.parent.grid.distance,pad=feet*scale,vector=(shape,angle)=>shape.gridBased?region.parent.grid.getTranslatedPoint({x:0,y:0},angle,feet):{x:pad*Math.cos(angle*Math.PI/180),y:pad*Math.sin(angle*Math.PI/180)},shapes=region.shapes.map(value=>{const shape=foundry.utils.deepClone(value);if(shape.hole)return null;if(['circle','emanation'].includes(shape.type))return {...shape,radius:shape.radius+pad};if(shape.type==='line'){const delta=vector(shape,shape.rotation??0);return {...shape,x:shape.x-delta.x,y:shape.y-delta.y,length:shape.length+2*pad,width:shape.width+2*pad};}if(shape.type==='rectangle'){const x=vector(shape,shape.rotation??0),y=vector(shape,(shape.rotation??0)+90),ax=2*(shape.anchorX??0)-1,ay=2*(shape.anchorY??0)-1;return {...shape,x:shape.x+ax*x.x+ay*y.x,y:shape.y+ax*x.y+ay*y.y,width:shape.width+2*pad,height:shape.height+2*pad};}return null;});
 if(shapes.some(shape=>!shape))return false;const elevation={bottom:region.elevation.bottom,top:region.elevation.top,topInclusive:true};for(const[key,direction]of[['bottom',-1],['top',1]])if(Number.isFinite(elevation[key]))elevation[key]+=feet*direction;const expanded=region.clone({shapes,elevation},{keepId:true,parent:region.parent});try{void expanded.polygonTree;return target.testInsideRegion(expanded);}finally{if(expanded._object?.document===expanded)expanded._object.destroy({children:true});}
}
