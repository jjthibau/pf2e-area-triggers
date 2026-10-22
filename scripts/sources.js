import {sourceActive,footprintAura,repairAuraRadii,targetLocalAura,environmentTagsFor} from './geometry.js';
import {ID,profileFor,profilesFor,profiles,slug} from './profiles.js';
export const now=()=>game.time.worldTime;
export const binding=r=>r?.getFlag(ID,'binding');
export const enabled=()=>game.settings.get(ID,'enabled');
export const gm=()=>game.user.isActiveGM;
export const updater=()=>game.users.activeGM;
 export const sceneActors=scene=>[...new Map([...game.actors,...scene.tokens.map(t=>t.actor)].filter(Boolean).map(a=>[a.uuid,a])).values()];
export const active=s=>enabled()&&!s.clockFired&&(!s.expiresAt||now()<s.expiresAt);
export function sourceOptions(s){return [...new Set([...s.traits,...s.traits.map(t=>'item:trait:'+t),...(s.options??[])])];}
export function anonymous(s){if(s.kind==='aura'||s.itemType&&s.itemType!=='spell')return false;const a=fromUuidSync(s.actorUUID);return !a?.hasPlayerOwner&&game.modules.get('pf2e-hidden-enemy-spells')?.active&&game.settings.get('pf2e-hidden-enemy-spells','enabled');}
export function sourceLabel(s){return anonymous(s)?'Area effect':s.name;}
export function sourceActor(s){
 let actor=null;try{actor=fromUuidSync(s.actorUUID);}catch{}if(actor||!s.troopId)return actor;
 return game.scenes.get(s.tokenUUID?.split('.')[1])?.tokens.find(t=>t.flags.pf2e?.troop?.id===s.troopId&&t.actor&&!t.actor.isDead)?.actor??null;
}
export async function sourceItem(s){const actor=sourceActor(s);if(!actor)return null;const snapshot=s.snapshot??(s.kind==='region'?binding(await fromUuid(s.instance))?.snapshot:null);return snapshot?new CONFIG.Item.documentClass(foundry.utils.deepClone(snapshot),{parent:actor}):s.troopId&&actor.uuid!==s.actorUUID?actor.items.get(s.itemUUID.split('.').at(-1)):await fromUuid(s.itemUUID);}
export function nativeDamage(item,index=0,expression=null){
 const text=expression?'@Damage['+expression+']':item.system.description.value.replace(/@Localize\[([^\]]+)\]/g,(_m,key)=>game.i18n.localize(key)),starts=[...text.matchAll(/@Damage\[/g)];const start=starts[index];if(!start)return null;
 let depth=1,end=start.index+start[0].length;const begin=end;
 while(end<text.length&&depth){if(text[end]==='[')depth++;if(text[end]===']')depth--;end++;}
 if(depth)return null;
 const data=item.getRollData(),formula=text.slice(begin,end-1).split('|')[0];let valid=true;
 const resolved=formula.replace(/@([a-zA-Z][\w.]*)/g,(_m,path)=>{const value=foundry.utils.getProperty(data,path);if(typeof value==='number'||typeof value==='string'&&/^[a-z][a-z-]*$/.test(value))return String(value);valid=false;return _m;});
 return valid?resolved:null;
}
export function mechanicsItem(item,p){if(!p.mechanicsFrom)return item;const direct=item.actor?.items.get(p.mechanicsFrom);if(direct)return direct;const matches=item.actor?.items.filter(i=>slug(i)===p.mechanicsSlug)??[];return matches.length===1?matches[0]:null;}
export function abilityMechanics(item,p){
 const actor=item.actor,text=item.system.description.value.replace(/@Localize\[([^\]]+)\]/g,(_m,key)=>game.i18n.localize(key));
 const checks=[...text.matchAll(/@Check\[([^\]]+)\]/g)].map(m=>m[1]),adjustment=actor.isOfType('npc')?(actor.isElite?2:actor.isWeak?-2:0):0;
 const getDC=(index=p.checkIndex??0,forcedAgainst)=>{const override=item.getFlag(ID,'dc');if(Number.isFinite(override)&&override>0)return override;const check=checks[index],fixed=p.fixedDC??(p.descriptionDC?Number(text.replace(/<[^>]*>/g,' ').match(/Saving\s+Throw\s+(?:DC\s*)?(\d+)/i)?.[1]):Number(check?.match(/(?:^|\|)dc:(\d+)/)?.[1]));if(fixed>0)return fixed+(p.ignoreDCAdjustment||p.save==='flat'||check?.split('|')[0]==='flat'?0:adjustment);const against=forcedAgainst??check?.match(/(?:^|\|)against:([^|]+)/)?.[1]??p.against;
  let originSpell=null;if(against==='spell'&&item.system.context?.origin?.item)try{originSpell=fromUuidSync(item.system.context.origin.item);}catch{}const statistic=against==='spell'?(originSpell?.isOfType('spell')?originSpell.spellcasting?.statistic?.withRollOptions({item:originSpell}):null)??actor.spellcasting?.contents.flatMap(e=>e.statistic??[]).sort((a,b)=>b.dc.value-a.dc.value)[0]:against?actor.getStatistic(against):null;return statistic?statistic.dc.value+(p.dcOffset??0):null;};
 return {dc:getDC(),damage:p.damage??(p.damageExpression?nativeDamage(item,0,p.damageExpression):p.damageIndex!==null?nativeDamage(item,p.damageIndex):null),adjustment,damageChoices:p.damageChoices?.map(c=>{const formula=nativeDamage(item,c.damageIndex??0,c.expression);return c.damageType?formula?.replaceAll('[untyped]','['+c.damageType+']'):formula;}),damageAdjustment:p.noDamageAdjustment?0:adjustment*(item.getRollOptions('item').includes('item:frequency:limited')?2:1),checkChoices:p.checkChoices?.map(c=>{const dc=getDC(c.checkIndex??0,c.against);return {save:c.save,label:c.label,dc:Number.isFinite(dc)?dc+(c.dcOffset??0):null};})};
}
export function auraSources(scene){
 const out=[];
 for(const token of scene.tokens){const actor=token.actor;if(!actor||actor.isDead||token.hidden)continue;repairAuraRadii(token);
  for(const item of actor.items)for(const p of profilesFor(item)){
   if(p.kind!=='aura'||!sourceActive(item,p))continue;
   const ownRules=actor.rules.filter(r=>r.key==='Aura'&&r.item.id===item.id&&r.test());if(!p.geometry&&!p.sharedAura&&!ownRules.length)continue;
   const choices=p.auraSlugs?.map(name=>name??slug(item)),name=choices?.find(name=>token.auras.has(name)&&ownRules.some(r=>(r.slug??slug(item))===name))??(choices?null:p.auraSlug??slug(item));
   const marker=token.auras.get(name),aura=p.geometry?.kind==='space'?footprintAura(token):p.geometry?.localCoverage&&marker?targetLocalAura(marker,p.geometry.radius):marker;if(!aura)continue;
   const mechanics=abilityMechanics(item,p);if(!p.canonical&&!p.directDamage&&!p.reminder&&(!Number.isFinite(mechanics.dc)||mechanics.dc<1))continue;
   if((p.basic||p.directDamage)&&!mechanics.damage)continue;
   out.push({kind:'aura',profile:p.id,instance:token.uuid+':'+item.id+(p.canonical?':'+p.id:''),name:item.name,actorUUID:actor.uuid,itemUUID:item.uuid,tokenUUID:token.uuid,traits:[...new Set([...item.system.traits.value,...aura.traits,...p.traits])],options:[...(p.options??[]),...(p.basic||p.damageSave||p.directDamage||p.independentDamage?['damaging-effect']:[])],rank:actor.level,...mechanics,aura});
  }
 }
 // Native troop segments are one creature. Share one source and use the union of
 // their native aura geometries rather than posting one request per segment.
 const groups=new Map();for(const s of out){const token=scene.tokens.get(s.tokenUUID.split('.').at(-1)),troop=token?.flags.pf2e?.troop;if(!troop){groups.set(s.instance,s);continue;}const key=troop.id+':'+s.profile,prior=groups.get(key);if(prior){prior.emitters.push(s.aura);}else groups.set(key,{...s,instance:scene.uuid+'.Troop.'+troop.id+':'+s.profile,troopId:troop.id,emitters:[s.aura]});}
 return [...groups.values()].map(s=>{if(!s.emitters)return s;const emitters=s.emitters;delete s.emitters;return {...s,aura:{traits:s.aura.traits,containsToken:target=>emitters.some(a=>a.containsToken(target))}};});
}
export async function bindRegion(region){
 if(!gm()||!enabled()||!region.isEffectArea&&!region.getFlag(ID,'linkedArea'))return null;
 if(binding(region)){
  // Core14 vertical crossings require the lazy native polygon tree to be initialized.
  void region.polygonTree;
  if(!region.behaviors.some(b=>b.type===ID+'.trigger'))await region.createEmbeddedDocuments('RegionBehavior',[{name:'Area trigger',type:ID+'.trigger',system:{}}]);
  return binding(region);
 }
 const origin=region.flags.pf2e?.origin;if(!origin?.uuid)return null;
 let item=region.message?.item??await fromUuid(origin.uuid);if(!item)return null;
 let p=profileFor(item);if(!['spell','area'].includes(p?.kind))return null;
 if(p.areaModes){const mode=region.getFlag(ID,'areaMode')??(!region.getFlag(ID,'linkedArea')?p.defaultAreaMode:null);if(!p.areaModes.some(m=>m.id===mode))return null;const id=p.id+'-'+mode;p={...profiles[id],id};}
 if(p.emanationBaseSize&&region.shapes.some(s=>s.type==='emanation'&&(s.base.width!==p.emanationBaseSize||s.base.height!==p.emanationBaseSize)))await region.update({shapes:region.shapes.map(s=>s.type==='emanation'?{...s,base:{...s.base,width:p.emanationBaseSize,height:p.emanationBaseSize}}:s)});
 if(p.kind==='spell'&&!p.directDamage&&!p.ignoreNativeDefense&&item.system.defense?.save?.statistic!==p.save)return null;
 const rank=origin.castRank??region.message?.flags.pf2e?.origin?.castRank??item.rank??item.actor.level;
 if(item.isOfType('spell'))item=item.loadVariant({castRank:rank,overlayIds:origin.variant?.overlays??[]})??item;
 if(p.traditionModes){const tradition=item.spellcasting?.tradition,id=p.id+'-'+tradition;if(!p.traditionModes[tradition])return null;p={...profiles[id],id};}
 if(p.areaRankCorrection&&region.shapes.length===1&&region.shapes[0].type==='line'){const a=p.areaRankCorrection,scale=region.parent.grid.size/region.parent.grid.distance,native=(rank>=a.nativeHeightenedRank?a.heightened:a.base)*scale,correct=(rank>=a.heightenedRank?a.heightened:a.base)*scale;if(native!==correct&&region.shapes[0].length===native)await region.update({shapes:region.shapes.map(shape=>({...shape,length:correct}))});}
 // PF2e8.6.0 omits Antlion Trap's area-heightening data. Correct only its normal initial circle.
 if(p.areaHeightening){const a=p.areaHeightening,scale=region.parent.grid.size/region.parent.grid.distance,base=a.base*scale,radius=(a.base+Math.floor((rank-(a.baseRank??item.baseRank))/a.interval)*a.increase)*scale;
  if(radius!==base&&region.shapes.length===1&&['circle','emanation'].includes(region.shapes[0].type)&&region.shapes[0].radius===base)await region.update({shapes:region.shapes.map(shape=>({...shape,radius}))});
 }
 const ruleItem=mechanicsItem(item,p);if(!ruleItem){if(region.getFlag(ID,'missingMechanics')!==p.mechanicsFrom){await region.setFlag(ID,'missingMechanics',p.mechanicsFrom);ui.notifications.warn('The source needs its owned '+(p.mechanicsSlug??'related ability')+' before this field can post prompts.');}return null;}
 const mechanics=p.kind==='area'?abilityMechanics(ruleItem,p):{},dc=p.kind==='area'?mechanics.dc:item.spellcasting?.statistic?.withRollOptions({item}).dc.value;if(p.kind==='spell'&&(!Number.isInteger(dc)||dc<1))return null;
 if(p.shellThickness&&region.shapes.length===1&&region.shapes[0].type==='circle'){const shape=region.shapes[0];await region.update({shapes:[{type:'ring',x:shape.x,y:shape.y,radius:shape.radius,innerWidth:p.shellThickness*region.parent.grid.size/region.parent.grid.distance,outerWidth:0,gridBased:shape.gridBased}]});}
 void region.polygonTree;
 let duration=p.durationByRank?p.durationByRank(rank):p.duration,durationRollId=null,expiresAt=duration?now()+duration:null;
 if(p.durationRoll){const castKey=region.message?.uuid??region.uuid,prior=region.parent.regions.map(binding).find(s=>s?.castKey===castKey&&s.durationRolled&&s.expiresAt>now());if(prior){duration=prior.durationRolled;expiresAt=prior.expiresAt;durationRollId=prior.durationRollId;}else{const roll=await new Roll(p.durationRoll).evaluate();duration=roll.total*(p.durationUnit==='rounds'?6:p.durationUnit==='minutes'?60:1);expiresAt=now()+duration;const message=await roll.toMessage({speaker:ChatMessage.getSpeaker({actor:item.actor}),flavor:sourceLabel({kind:'region',itemType:item.type,actorUUID:item.actor.uuid,name:item.name})+': cloud duration ('+(p.durationUnit??'seconds')+')',whisper:ChatMessage.getWhisperRecipients('GM').map(u=>u.id)},{messageMode:'gm'});durationRollId=message.id;}}
 const snapshot=ruleItem.toObject();if(item.isOfType('spell')){snapshot.system.location.heightenedLevel=rank;snapshot.system.location.autoHeightenLevel=rank;}
 const s={...mechanics,kind:'region',itemType:item.type,profile:p.id,instance:region.uuid,castKey:region.message?.uuid??region.uuid,name:item.name+(p.modeLabel?': '+p.modeLabel:''),actorUUID:item.actor.uuid,itemUUID:ruleItem.uuid,controlItemUUID:origin.uuid,messageId:region.message?.id??null,rank,dc,traits:[...new Set([...ruleItem.traits,...p.traits])],options:[...(p.options??[]),...(p.basic||p.damageSave||p.directDamage||p.independentDamage?['damaging-effect']:[])],snapshot,createdAt:now(),expiresAt,...(p.durationRoll?{durationRolled:duration,durationRollId}:{})};
 if(p.initialSweep)s.initialSweepPending=true;
 if(p.initialPulse)s.initialPulsePending=true;
 if(p.events.includes('sustain')&&game.combat?.started&&game.combat.scene?.id===region.parent.id)s.castCombat={id:game.combat.id,round:game.combat.round,turn:game.combat.turn};
 if(p.kind==='spell'&&p.checkChoices)s.checkChoices=p.checkChoices.map(c=>({save:c.save,label:c.label,options:c.options??[],dc}));
 if(p.expireOnSourceEnd&&game.combat?.started&&game.combat.scene?.id===region.parent.id)s.sourceEndExpiry={combatId:game.combat.id,round:game.combat.round+(game.combat.combatant?.actor?.uuid===s.actorUUID?1:0)};
 if(p.clockSourcePhase){const combat=startedEncounter(region.parent),owner=combat?.turns.findIndex(c=>c.actor?.uuid===s.actorUUID)??-1;if(owner>=0){const phase=p.clockSourcePhase;s.clockDeadline={id:foundry.utils.randomID(),combatId:combat.id,combatantId:combat.turns[owner].id,phase,round:combat.round+(phase==='start'?owner<=combat.turn:owner<combat.turn)+(p.clockDelayRounds??1)-1};}}
 if(p.followCaster){const spoken=region.message?.speaker?.token,matching=region.parent.tokens.filter(t=>t.actor?.uuid===item.actor.uuid),token=region.parent.tokens.get(spoken)??(matching.length===1?matching[0]:null);if(token)s.follow={tokenUUID:token.uuid,x:token.x,y:token.y,elevation:token.elevation};}
 await region.setFlag(ID,'binding',s);
 if(!region.behaviors.some(b=>b.type===ID+'.trigger'))await region.createEmbeddedDocuments('RegionBehavior',[{name:'Area trigger',type:ID+'.trigger',system:{}}]);
 return s;
}
export async function linkArea(messageId,regionUUID,mode=null){
 const message=game.messages.get(messageId),item=message?.item,p=item&&profileFor(item),region=await fromUuid(regionUUID);
 if(!p?.customArea||!item?.actor?.isOwner||(p.kind==='spell'&&!message.flags.pf2e?.casting))throw Error('Choose a supported spell casting or area ability you own.');
 if(!region||region.documentName!=='Region'||region.parent!==canvas.scene||!region.isOwner||!region.shapes.length)throw Error('Choose a drawn area you own on the current scene.');
 if(binding(region)||region.flags.pf2e?.origin)throw Error('This area is already associated with an effect.');
 if(p.areaModes&&!p.areaModes.some(m=>m.id===mode))throw Error('Choose which effect this area represents.');
 await region.update({[`flags.${ID}.linkedArea`]:true,...(mode?{[`flags.${ID}.areaMode`]:mode}:{}),'flags.pf2e.messageId':message.id,'flags.pf2e.origin':{name:item.name,slug:item.slug,traits:[...item.traits],...item.getOriginData(),uuid:item.uuid,castRank:message.flags.pf2e.origin?.castRank??item.rank}});
 return region;
}
export async function syncFollowingRegions(token,movement=null){
 if(!gm()||!enabled())return [];const exposures=[];
 for(const region of token.parent.regions){const s=binding(region);if(s?.follow?.tokenUUID!==token.uuid)continue;const dx=token.x-s.follow.x,dy=token.y-s.follow.y,previousElevation=s.follow.elevation??movement?.origin?.elevation??token.elevation,dz=token.elevation-previousElevation;if(!dx&&!dy&&!dz)continue;
  const tracked=profiles[s.profile]?.followExposure?region.parent.tokens.filter(t=>t.actor).map(t=>({token:t,inside:t.testInsideRegion(region)})):[];
  const shift=shape=>({...shape,...(shape.type==='emanation'?{base:shift(shape.base)}:shape.type==='polygon'?{points:shape.points.map((v,i)=>v+(i%2?dy:dx))}:{x:shape.x+dx,y:shape.y+dy})});const shapes=region.shapes.map(shift);
  const elevation={};if(dz)for(const key of ['bottom','top'])if(Number.isFinite(region.elevation[key]))elevation['elevation.'+key]=region.elevation[key]+dz;
  await region.update({shapes,...elevation,[`flags.${ID}.binding.follow`]:{tokenUUID:token.uuid,x:token.x,y:token.y,elevation:token.elevation}});
  void region.polygonTree;for(const prior of tracked){const inside=prior.token.testInsideRegion(region);if(inside!==prior.inside)exposures.push({source:binding(region),target:prior.token,event:inside?'enter':'leave'});}
 }
 return exposures;
}

const automaticEnvironments={"Compendium.pf2e.spells-srd.Item.4GE2ZdODgIQtg51c":{"tags":["magical-darkness"],"duration":60},"Compendium.pf2e.spells-srd.Item.sFwoKj0TsacsmoWj":{"tags":["magical-darkness"],"duration":60},"Compendium.pf2e.spells-srd.Item.g1dDUKsIrdlpdqy9":{"tags":["magical-darkness"],"duration":60},"Compendium.pf2e.lost-omens-bestiary.Actor.qjDJBJGntdOdyGxq.Item.PrX599wjM2dd3n6F":{"tags":["magical-darkness"],"duration":60},"Compendium.pf2e.pathfinder-monster-core-2.Actor.Tf1eWEQJmFEtcCps.Item.XqqRVcphn1WMpRJB":{"tags":["magical-darkness"],"duration":60},"Compendium.pf2e.stolen-fate-bestiary.Actor.jYHPxFsTUS6jGY4a.Item.ZwOinMaTzmRM28rJ":{"tags":["magical-darkness"],"duration":60}};
export async function synchronizeEnvironments(scene=canvas.scene){if(!gm()||!scene)return;for(const region of scene.regions){let exposure=region.getFlag(ID,'environmentBinding');if(!exposure){const origin=region.flags.pf2e?.origin;let item=region.message?.item;if(!item&&origin?.uuid)try{item=await fromUuid(origin.uuid);}catch{}const canonical=profileFor(item)?.canonical??item?.sourceId??item?._stats?.compendiumSource,definition=automaticEnvironments[canonical];if(definition){exposure={...definition,canonical,createdAt:now(),expiresAt:now()+definition.duration};await region.setFlag(ID,'environmentBinding',exposure);}}if(environmentTagsFor(region).length)void region.polygonTree;if(environmentTagsFor(region).length&&!region.behaviors.some(b=>b.type===ID+'.trigger'))await region.createEmbeddedDocuments('RegionBehavior',[{name:'Environmental area trigger',type:ID+'.trigger',system:{}}]);}}
function nativeBrightLight(token){const grid=token.parent.grid,points=[{...token.center,elevation:token.elevation},...token.getOccupiedGridSpaceOffsets().map(offset=>({...grid.getCenterPoint(offset),elevation:token.elevation}))];return points.some(point=>canvas.effects.testInsideLight(point,{condition:source=>source.data.bright>0&&Math.hypot(point.x-source.data.x,point.y-source.data.y)<=source.data.bright}));}
export function environmentSources(token,event,region=null){const actor=token.actor;if(!actor||actor.isDead)return [];const regions=region?[region]:token.parent.regions,exposures=new Set([...regions].filter(r=>!r.hidden&&environmentTagsFor(r).length&&r.behaviors.some(b=>b.type===ID+'.trigger'&&!b.disabled)&&token.testInsideRegion(r)).flatMap(environmentTagsFor)),out=[];for(const item of actor.items)for(const p of profilesFor(item)){if(p.kind!=='environment'||!p.events.includes(event)||!sourceActive(item,p))continue;const eventProfile={...p,...p.eventOverrides?.[event]},matches=eventProfile.environmentAny?.some(tag=>exposures.has(tag)||!region&&tag==='bright-light'&&!exposures.has('magical-darkness')&&nativeBrightLight(token));if(!matches)continue;const troop=token.flags.pf2e?.troop?.id,mechanics=abilityMechanics(item,eventProfile);out.push({kind:'environment',profile:p.id,instance:(troop?token.parent.uuid+'.Troop.'+troop:token.uuid)+':'+item.id,actorUUID:actor.uuid,itemUUID:item.uuid,tokenUUID:token.uuid,...(troop?{troopId:troop}:{}),name:item.name,rank:actor.level,traits:[...new Set([...item.traits,...eventProfile.traits])],options:[...(eventProfile.options??[]),...(eventProfile.basic||eventProfile.damageSave||eventProfile.nativeDirectDamage?['damaging-effect']:[])],...mechanics});}return out;}

export function startedEncounter(scene=canvas.scene){return scene&&game.combats.find(combat=>combat.active&&combat.started&&combat.scene?.id===scene.id)||null;}
export function sourceLive(source,scene=canvas.scene){const encounter=startedEncounter(scene),actor=sourceActor(source);if(!encounter||!actor)return false;let item;try{item=fromUuidSync(source.controlItemUUID??source.itemUUID);}catch{}const mode=item?.getFlag(ID,'liveMode')??'auto';if(mode==='paused')return false;if(mode==='live')return true;if(!actor.isOfType('hazard')&&!profiles[source.profile]?.requireGMLive)return true;return encounter.combatants.some(c=>c.actor?.uuid===actor.uuid||c.actorId===actor.id);}
export async function setSourceLive(itemUUID,mode){const item=await fromUuid(itemUUID);if(!game.user.isGM||!item?.actor)throw Error('Only the GM can control hazard area activation.');if(!['auto','live','paused'].includes(mode))throw Error('Choose initiative, live or paused.');await item.setFlag(ID,'liveMode',mode);}
