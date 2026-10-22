import {ensureGeometry,setActive,movementProbe,eventContains} from './geometry.js';
import {ID,profiles,profileFor,esc,multiplier} from './profiles.js';
import {now,binding,enabled,gm,active,sourceOptions,sourceItem,sourceLabel,auraSources,bindRegion,nativeDamage,sourceActor,linkArea,synchronizeEnvironments,environmentSources,startedEncounter,sourceLive,setSourceLive,abilityMechanics} from './sources.js';
const socket='module.'+ID,waiters=new Map(),rolling=new Set();let queue=Promise.resolve();
const placementTargets=new Map();
export function rememberPlacement(region){if(gm()&&enabled()&&canvas.ready&&region.parent===canvas.scene)placementTargets.set(region.uuid,region.parent.tokens.filter(t=>t.actor&&t.testInsideRegion(region)).map(t=>t.uuid));}
export const enqueue=fn=>{const task=queue.then(fn);queue=task.catch(e=>console.error(ID,e));return task;};
export const idle=()=>queue;
const req=m=>m?.getFlag(ID,'request');
const castRegions=s=>s.kind==='aura'?[canvas.scene.tokens.get(s.tokenUUID.split('.').at(-1))].filter(Boolean):canvas.scene.regions.filter(r=>{const b=binding(r);return b&&(b.castKey??b.instance)===(s.castKey??s.instance);});
const identity=target=>target.flags.pf2e?.troop?target.parent.uuid+'.Troop.'+target.flags.pf2e.troop.id:target.actor.uuid;
const isTurnOf=(t,c)=>c?.actor?.uuid===t.actor.uuid||t.flags.pf2e?.troop?.id&&t.flags.pf2e.troop.id===c?.flags.pf2e?.troop;
const isSourceTarget=(s,t)=>s.tokenUUID===t.uuid||s.troopId&&s.troopId===t.flags.pf2e?.troop?.id;
const ownsSource=(s,c)=>s.actorUUID===c.actor?.uuid||s.troopId&&s.troopId===c.flags?.pf2e?.troop;
const actorKey=(uuid,s)=>((s?.profile?s.profile+'--':'')+uuid).replaceAll('.','-');
const behavior=(id,event)=>({...profiles[id],...profiles[id]?.eventOverrides?.[event]});
const factor=r=>{if(r.skipDamage)return 0;const p=behavior(r.source.profile,r.event);return p.attack&&r.attackAttempted?({criticalSuccess:2,success:1,failure:0,criticalFailure:0}[r.outcome]??0):p.directDamage||p.independentDamage?1:(p.damageMultipliers?.[r.outcome]??multiplier(r.outcome));};
function emit(data){game.socket.emit(socket,{...data,userId:game.user.id});}
export function renderCard(r){
 const p=behavior(r.source.profile,r.event),status=r.status==='ready'?(r.damageRolled?(p.healing?'Healing rolled':'Damage rolled'):(p.healing?'Healing required':'Damage required')):r.status==='resolved'?'Resolved':r.status==='cancelled'?'Area ended':r.status==='notice'?'Effect reminder':r.status==='rolling'?'Roll pending':p.attack?'Attack required':'Save required';
 const showDC=game.settings.get('pf2e','metagame_showDC'),visibility=r.secretResult||!game.settings.get('pf2e','metagame_showResults')?'gm':'all';
 const choices=r.source.checkChoices??[{save:r.save,dc:r.source.dc}];
 const missing=r.save&&choices.some(c=>!Number.isFinite(c.dc)||c.dc<1);
 const controls=r.status==='pending'?choices.map((c,i)=>{const valid=Number.isFinite(c.dc)&&c.dc>0,label=game.i18n.localize(CONFIG.PF2E.saves[c.save]??CONFIG.PF2E.skills[c.save]?.label??c.save);if(p.attack)return `<button type="button" data-area-save="${i}" ${valid?'':'disabled'}>Roll caster spell attack${showDC&&valid?' vs DC '+c.dc+' '+esc(p.attack):''}</button>`;return `<button type="button" data-area-save="${i}" ${valid?'':'disabled'}>${valid?(showDC?'DC '+c.dc+' ':''):'Awaiting GM DC: '}Roll ${esc(label)} ${['fortitude','reflex','will'].includes(c.save)?'save':'check'}${c.label?' ('+esc(c.label)+')':''}</button>`;}).join(''):r.status==='notice'&&p.gmActivation?'<button type="button" data-area-haunt>GM: activate linked areas</button>':r.status==='notice'&&p.gmDecision&&!r.approved?`<button type="button" data-area-approve>${esc(p.decisionLabel??'Request saving throw')}</button>`:`<span>${esc(status)}</span>`;
 const timing={enter:'Entering area',leave:'Leaving area',move:'Movement from within area',teleport:'Teleporting within or into area',start:'Start of turn',cast:'Spell cast',round:'Round start',sustain:'Sustain','source-start':'Source starts turn','source-end':'Source ends turn',activate:'Area activated',scheduled:'Scheduled area effect',end:'End of turn'};
 const outcome=r.outcome?`<p>${esc(game.i18n.localize('PF2E.Check.Result.Degree.Check.'+r.outcome))}</p>`:'',effect=r.outcome&&p.outcomes?.[r.outcome];
 const hasDamage=(p.independentDamage&&(r.source.damage||p.damageFormula)&&(!r.attackAttempted||factor(r)>0))||(p.directDamage&&r.status!=='cancelled')||(r.outcome&&(p.basic||p.damageSave)&&factor(r)>0);
 return `<div class="pf2e chat-card area-trigger-card"><header><h3>${p.gmDecision&&!r.approved?esc((r.source.tokenUUID?fromUuidSync(r.source.tokenUUID)?.name:null)??sourceActor(r.source)?.name??'Source')+': ':''}${esc(r.label)}</h3></header><p>${esc(r.targetName)}: ${esc(timing[r.event]??r.event)}</p>${r.enteredSquares?`<p>Entered ${r.enteredSquares} marked hazardous square${r.enteredSquares===1?'':'s'}.</p>`:''}<section class="card-buttons">${controls}<div data-visibility="gm">${missing?'<label>Set missing source DC <input type="number" min="1" max="100" data-area-dc><button type="button" data-area-set-dc>Set DC</button></label>':''}</div><div data-visibility="${visibility}">${outcome}${p.note?`<p>${esc(p.note)}</p>`:''}${effect?`<p>${esc(effect)}</p>`:''}${hasDamage?`<p>${p.healing?'Roll healing with the native controls.':p.independentDamage?'Use the amount required by this ability.':(p.basic?'Basic save':'Damage')+': '+(factor(r)===0.5?'half':factor(r)===2?'double':'full')+' damage.'}</p>${(p.damageChoices??[{label:p.conditionalDamageLabel??(p.healing?'Roll healing':p.independentDamage?'Roll damage if applicable':'Roll damage')}]).map((c,i)=>`<button type="button" data-area-damage="${i}" ${r.damageRolled?'disabled':''}>${r.damageRolled?(p.healing?'Healing rolled':'Damage rolled'):esc(c.label)}</button>`).join('')}`:''}</div></section></div>`;
}

async function update(m,r){await m.update({content:renderCard(r),[`flags.${ID}.request`]:r});}
export async function trigger(s,target,event,key,window={}){
 const request=await triggerOne(s,target,event,key,window),p=profiles[s.profile];
 for(const companion of p?.fieldCompanions??[]){const id=s.profile+'-'+companion.id,child=profiles[id],state=s.kind==='region'?binding(fromUuidSync(s.instance))?.fieldState:null;if(!child.events.includes(event)||child.requireFieldState&&child.requireFieldState!==state)continue;await triggerOne({...s,profile:id,name:s.name+': '+child.modeLabel,options:[...s.options,...(child.basic||child.directDamage?['damaging-effect']:[])]},target,event,key,window);}
 return request;
}
async function triggerOne(s,target,event,key,window={}){
 if(!gm()||!enabled()||!active(s)||!profiles[s.profile].events.includes(event)||!target?.actor?.isOfType(...(profiles[s.profile].targetTypes??['creature']))||target.actor.isDead)return null;
 if(!sourceLive(s,target.parent)||s.clockDeadline&&!s.clockActive&&event!=='scheduled')return null;
 let p=behavior(s.profile,event);
 if(p.adjacentOnly&&castRegions(s).some(r=>binding(r)?.profile===p.bufferFamily+'-main'&&target.testInsideRegion(r)))return null;
 if(p.triggerCount){const zones=castRegions(s).filter(r=>binding(r)?.profile===s.profile),rule=p.triggerCount,creatures=new Set(target.parent.tokens.filter(t=>t.actor?.isOfType('creature')&&!t.actor.isDead&&(!rule.mode||t.actor.modeOfBeing===rule.mode)&&(rule.minSize===undefined||['tiny','sm','med','lg','huge','grg'].indexOf(t.actor.size)>=rule.minSize)&&zones.some(r=>t.testInsideRegion(r))).map(identity));if(creatures.size<rule.minimum)return null;}
 if(p.nearbyPersistentType||p.nearbyCondition||p.nearbySameSource){const origin=sourceActor(s),originSource=origin?.sourceId??origin?._stats?.compendiumSource;if(!target.parent.tokens.some(t=>{const a=t.actor;if(!a?.isOfType('creature')||a.isDead||!s.aura?.containsToken(t))return false;if((p.nearbyExcludeSource||p.nearbySameSource)&&a.uuid===origin?.uuid)return false;if(p.nearbySize!==undefined&&['tiny','sm','med','lg','huge','grg'].indexOf(a.size)!==p.nearbySize)return false;if(p.nearbySameSource&&(!originSource||(a.sourceId??a._stats?.compendiumSource)!==originSource))return false;if(p.nearbyCondition&&!a.hasCondition(p.nearbyCondition))return false;return !p.nearbyPersistentType||a.itemTypes.condition.some(c=>c.active&&c.system.persistent?.damageType===p.nearbyPersistentType);}))return null;}
 if(p.targetMode&&target.actor.modeOfBeing!==p.targetMode)return null;
 if(p.targetTraits?.some(trait=>!target.actor.system.traits.value.includes(trait)))return null;
 if(p.excludeTargetTraits?.some(trait=>target.actor.system.traits.value.includes(trait)))return null;
 if(p.excludeTargetSources?.includes(target.actor.sourceId??target.actor._stats?.compendiumSource))return null;
 let initialOutcome=null;
 if(p.initialResultEvents?.includes(event)){const region=castRegions(s).find(r=>r.getFlag(ID,'ledger')?.[actorKey(identity(target),s)]),entry=region?.getFlag(ID,'ledger')?.[actorKey(identity(target),s)];initialOutcome=entry?.outcome;if(!initialOutcome){if(event==='leave'&&entry?.requestId){const ledger=foundry.utils.deepClone(region.getFlag(ID,'ledger'));ledger[actorKey(identity(target),s)].queuedLeaveKey=key;await region.setFlag(ID,'ledger',ledger);}return null;}if(!(p.requiredInitialOutcomes??['success','failure','criticalFailure']).includes(initialOutcome))return null;}
 if(p.targetModes){const traitMode=Object.entries(p.targetTraitModes??{}).find(([trait])=>target.actor.system.traits.value.includes(trait))?.[1],mode=p.sourceTargetModes?(s.actorUUID===target.actor.uuid?'source':'other'):traitMode??target.actor.modeOfBeing,id=s.profile+'-'+mode;if(!p.targetModes[mode])return null;s={...s,profile:id,name:s.name+': '+profiles[id].modeLabel,options:[...(s.options??[]),...(profiles[id].basic?['damaging-effect']:[])]};p=behavior(id,event);}
 if(p.regionRadius&&s.kind==='region'){const region=fromUuidSync(s.instance);if(!region)return null;const radius=p.regionRadius*region.parent.grid.size/region.parent.grid.distance,inner=region.clone({shapes:region.shapes.map(shape=>['emanation','circle'].includes(shape.type)?{...shape,radius}:shape)},{keepId:true,parent:region.parent});if(!target.testInsideRegion(inner))return null;}
 if(!p.ignoreVisual&&s.traits.includes('visual')&&(target.actor.hasCondition('blinded')||target.actor.hasCondition('unconscious')))return null;
 if(p.excludeSource&&s.actorUUID===target.actor.uuid)return null;
 if(p.sourceOnly&&s.actorUUID!==target.actor.uuid)return null;
 if(p.affects){const source=sourceActor(s),self=source?.uuid===target.actor.uuid;if(p.affects==='allies'&&!(self?p.includeSelf:source?.isAllyOf(target.actor)))return null;if(p.affects==='enemies'&&(self||!source?.isEnemyOf(target.actor)))return null;}
 if(p.suppressWhenUnconscious&&fromUuidSync(s.actorUUID)?.hasCondition('unconscious'))return null;
 if(event==='enter'&&p.entryOwnTurn&&(!game.combat?.started||game.combat.scene?.id!==target.parent.id||!isTurnOf(target,game.combat.combatant)))return null;
 if(p.minSize!==undefined&&['tiny','sm','med','lg','huge','grg'].indexOf(target.actor.size)<p.minSize)return null;
 if(p.maxSize!==undefined&&['tiny','sm','med','lg','huge','grg'].indexOf(target.actor.size)>p.maxSize)return null;
 const encounter=window.encounter??game.combat,epoch=encounter?.started!==false&&encounter?.scene?.id===target.parent.id?encounter.id+':'+encounter.round+(p.frequency==='turn'?':'+(window.combatant?.id??encounter.combatant?.id):''):'time:'+Math.floor(now()/6);
 if(p.frequency==='combat'&&!encounter?.started)return null;
 const windowKey=p.frequency==='cast'?'initial':p.frequency==='combat'?encounter.id:epoch,eventKey=p.frequency?(s.castKey??s.instance)+'|'+s.profile+'|'+identity(target)+'|'+p.frequency+'|'+windowKey:s.instance+'|'+s.profile+'|'+(target.flags.pf2e?.troop?identity(target):target.uuid)+'|'+event+'|'+key;
 if(p.frequency&&castRegions(s).some(r=>{const v=r.getFlag(ID,'ledger')?.[actorKey(identity(target),s)];return v?.window===windowKey&&(v.outcome||game.messages.has(v.requestId));}))return null;
 if(game.messages.some(m=>req(m)?.key===eventKey))return null;
 const stored={...s};if(p.noDamageAdjustment)stored.damageAdjustment=0;if(p.extraTraits)stored.traits=[...new Set([...s.traits,...p.extraTraits])];const eventChoices=profiles[s.profile].eventOverrides?.[event]?.checkChoices;if(eventChoices)stored.checkChoices=eventChoices.map(c=>({...c,dc:c.dc??s.dc}));delete stored.aura;delete stored.snapshot;if(Number.isInteger(p.adjacentDamageIndex)&&s.kind==='region'&&!target.testInsideRegion(fromUuidSync(s.instance)))stored.damage=nativeDamage(await sourceItem(s),p.adjacentDamageIndex);if(p.attack){stored.casterDC=s.dc;stored.dc=target.actor.getStatistic(p.attack)?.dc.value;}
 if(p.flatGateDC)stored.checkChoices=[{save:'flat',dc:p.flatGateDC}];
 const r={...(initialOutcome?{initialOutcome}:{}),...(window.enteredSquares?{enteredSquares:window.enteredSquares}:{}),...(p.flatGateDC?{gate:'flat',gateSpellDC:s.dc}:{}),key:eventKey,source:stored,save:p.flatGateDC?'flat':p.attack?'spell-attack':p.save,targetUUID:target.uuid,actorUUID:target.actor.uuid,identity:identity(target),targetName:target.name,label:sourceLabel(s),event,status:p.reminder||p.gmDecision?'notice':p.directDamage?'ready':'pending',createdAt:now()};
 const message=await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:target.actor,token:target}),whisper:target.hidden||p.gmOnly||p.gmDecision?ChatMessage.getWhisperRecipients('GM').map(u=>u.id):[],content:renderCard(r),flags:{[ID]:{request:r}}});
 if(p.frequency)for(const region of castRegions(s)){const ledger={...(region.getFlag(ID,'ledger')??{}),[actorKey(identity(target),s)]:{window:windowKey,requestId:message.id,...(p.reminder?{outcome:'notice'}:{})}};await region.setFlag(ID,'ledger',ledger);}
 return message;
}
export async function turn(combatant,encounter,event){
 if(!gm()||!canvas.ready||!enabled()||!startedEncounter(canvas.scene)||encounter.scene?.id!==canvas.scene.id)return;
 if(event==='start'){await runScheduled(combatant,encounter,'start');for(const item of combatant.actor?.items??[]){const p=profileFor(item);if(p?.endOnSourceStart&&item.getFlag(ID,'active')?.enabled)await setActive(item.uuid,false);}}
 const key=encounter.id+':'+encounter.round+':'+combatant.id;
 const ownerEvent='source-'+event;
 for(const s of auraSources(canvas.scene))if(ownsSource(s,combatant)&&profiles[s.profile].events.includes(ownerEvent))for(const target of canvas.scene.tokens)if((!isSourceTarget(s,target)||profiles[s.profile].includeSelf)&&s.aura.containsToken(target))await trigger(s,target,ownerEvent,key,{encounter,combatant});
 for(const region of canvas.scene.regions){const s=binding(region);if(s&&s.actorUUID===combatant.actor?.uuid&&profiles[s.profile]?.events.includes(ownerEvent)&&!region.hidden&&region.behaviors.some(b=>b.type===ID+'.trigger'&&!b.disabled))for(const target of canvas.scene.tokens)if(target.testInsideRegion(region))await trigger(s,target,ownerEvent,key,{encounter,combatant});}
 if(event==='start')for(const region of [...canvas.scene.regions]){const s=binding(region);if(s&&profiles[s.profile]?.expireOnSourceStart&&s.actorUUID===combatant.actor?.uuid)await region.delete();}
 for(const target of combatant.tokens??[combatant.token]){if(!target)continue;
  for(const source of environmentSources(target,event))await trigger(source,target,event,key,{encounter,combatant});
  for(const s of auraSources(canvas.scene))if((!isSourceTarget(s,target)||profiles[s.profile].includeSelf)&&s.aura.containsToken(target))await trigger(s,target,event,key,{encounter,combatant});
  for(const region of canvas.scene.regions){const s=binding(region);if(s&&!profiles[s.profile]?.anyTurn&&!region.hidden&&region.behaviors.some(b=>b.type===ID+'.trigger'&&!b.disabled)&&eventContains(region,target,event))await trigger(s,target,event,key,{encounter,combatant});}
 }
 for(const region of canvas.scene.regions){const source=binding(region),profile=profiles[source?.profile];if(!source||!profile?.anyTurn||!profile.events.includes(event)||region.hidden||!region.behaviors.some(b=>b.type===ID+'.trigger'&&!b.disabled))continue;const target=(combatant.tokens??[combatant.token]).find(t=>t?.actor?.isOfType('creature')&&!t.actor.isDead)??canvas.scene.tokens.find(t=>t.actor?.isOfType('creature')&&!t.actor.isDead&&t.testInsideRegion(region));if(target)await trigger(source,target,event,key,{encounter,combatant});}
 if(event==='end')for(const region of [...canvas.scene.regions]){const s=binding(region),expiry=s?.sourceEndExpiry;if(expiry?.combatId===encounter.id&&encounter.round>=expiry.round&&ownsSource(s,combatant))await region.delete();}
}
export async function enter(region,event){
 if(!gm()||!enabled()||!startedEncounter(region.parent)||region.hidden)return;const t=event.data.token,envMovement=event.data.movement;if(event.name==='tokenMoveIn'&&envMovement)for(const source of environmentSources(t,'enter',region))await trigger(source,t,'enter',envMovement.subpathId??envMovement.id??JSON.stringify(envMovement.destination));const s=binding(region);if(!s)return;
 const p=profiles[s.profile],timing=p.regionMovement?'move':event.name==='tokenMoveOut'?'leave':event.name==='tokenMoveWithin'?null:'enter';if(p.shellThickness||p.countEnteredSquares||!timing||!p.events.includes(timing))return;
 // Core movement events include a stable movement ID; never treat area placement/activation as entry.
 const movement=event.data.movement,key=(p.regionMovement?movement?.subpathId:null)??movement?.id??movement?.movementId??JSON.stringify(movement?.origin??{})+':'+JSON.stringify(movement?.destination??{})+':'+now();
 if(p.regionMovement){const path=movement?.passed?.waypoints??movement?.waypoints??[],destination=movement?.destination??path.at(-1),origin=movement?.origin;if(!origin||!destination||['x','y','elevation'].every(k=>(origin[k]??t[k])===(destination[k]??t[k]))||CONFIG.Token.movement.actions[destination.action]?.teleport||path.length&&path.every(w=>CONFIG.Token.movement.actions[w.action]?.teleport))return;}
 await trigger(s,t,timing,key);
}
export async function round(encounter){
 if(!gm()||!enabled()||!canvas.ready||encounter.scene?.id!==canvas.scene.id)return;
 for(const region of canvas.scene.regions){const s=binding(region);if(!s||!profiles[s.profile].events.includes('round')||region.hidden||!region.behaviors.some(b=>b.type===ID+'.trigger'&&!b.disabled))continue;
  for(const token of canvas.scene.tokens)if(token.testInsideRegion(region))await trigger(s,token,'round',encounter.id+':'+encounter.round,{encounter});
 }
}
export async function reconcile(){
 if(!gm()||!canvas.ready||!enabled())return;
 await ensureGeometry();await synchronizeEnvironments();
 for(const r of [...canvas.scene.regions]){
  const s=binding(r);if(s&&s.expiresAt&&s.expiresAt<=now()){await r.delete();continue;}
  const bound=await bindRegion(r);
  if(!s){const initial=placementTargets.get(r.uuid);placementTargets.delete(r.uuid);if(bound&&profiles[bound.profile].events.includes('cast'))for(const token of canvas.scene.tokens)if(initial&&!profiles[bound.profile].shellThickness?initial.includes(token.uuid):token.testInsideRegion(r))await trigger(bound,token,'cast','placement');}
 }
 for(const m of game.messages){const r=req(m);if(r?.status==='rolling'&&r.claimUntil<Date.now()){r.status='pending';r.claimedBy=null;if(behavior(r.source.profile,r.event).attack)r.attackAttempted=false;await update(m,r);}}
}
export async function ended(region){
 if(!gm())return;
 placementTargets.delete(region.uuid);
 for(const m of game.messages){const r=req(m);if(r?.source.instance===region.uuid&&['pending','rolling','ready'].includes(r.status)){r.status='cancelled';await update(m,r);}}
}
function owner(r,user){const p=behavior(r.source.profile,r.event),a=p.attack?sourceActor(r.source):fromUuidSync(r.actorUUID);return user?.active&&(user.isGM||!p.gmOnly&&a?.testUserPermission(user,'OWNER'));}
async function claim(data){
 const m=game.messages.get(data.messageId),r=req(m),user=game.users.get(data.userId);
 if(!r||!owner(r,user)||r.status!=='pending')return {granted:false};
 const choice=(r.source.checkChoices??[{save:r.save,dc:r.source.dc}])[data.choice??0];if(!choice||!Number.isFinite(choice.dc)||choice.dc<1)return {granted:false};r.save=choice.save;r.source.dc=choice.dc;if(behavior(r.source.profile,r.event).attack)r.attackAttempted=true;
 if(r.source.expiresAt&&r.source.expiresAt<=now())return {granted:false};
 r.status='rolling';r.claimedBy=user.id;r.claimUntil=Date.now()+120000;r.nonce=data.nonce;await update(m,r);return {granted:true,save:r.save,dc:r.source.dc,options:choice.options??[]};
}
async function release(data){const m=game.messages.get(data.messageId),r=req(m);if(r?.status==='rolling'&&r.claimedBy===data.userId&&r.nonce===data.nonce){r.status='pending';r.claimedBy=null;if(behavior(r.source.profile,r.event).attack)r.attackAttempted=false;await update(m,r);}}
export async function resolve(data){
 const m=game.messages.get(data.messageId),r=req(m),roll=game.messages.get(data.rollId),user=game.users.get(data.userId),c=roll?.flags.pf2e?.context;
 if(!r||r.status!=='rolling'||r.claimedBy!==data.userId||r.nonce!==data.nonce||!owner(r,user))return;
 const p=behavior(r.source.profile,r.event),actor=p.attack?sourceActor(r.source):await fromUuid(r.actorUUID);
 if(roll?.author?.id!==user.id||roll.speaker.actor!==actor.id||c?.type!==(p.attack?'attack-roll':r.save==='flat'?'flat-check':['fortitude','reflex','will'].includes(r.save)?'saving-throw':'skill-check')||!c.options?.includes('area-trigger:request:'+m.id)||c.dc?.value!==r.source.dc||!['criticalSuccess','success','failure','criticalFailure'].includes(c.outcome))return;
 r.status='resolved';r.outcome=c.outcome;r.rollId=roll.id;r.secretResult=roll.blind||roll.whisper.length>0;r.claimedBy=null;
 if(r.gate==='flat'){r.gateOutcome=c.outcome;r.gateRollId=roll.id;if(['success','criticalSuccess'].includes(c.outcome)){r.gate='passed';r.skipDamage=true;}else{r.gate='save';r.status='pending';r.save=p.save;r.source.dc=r.gateSpellDC;r.source.checkChoices=[{save:p.save,dc:r.gateSpellDC}];r.outcome=null;r.rollId=null;}await update(m,r);return;}
 const followups=[];if(p.frequency)for(const region of castRegions(r.source)){const ledger=foundry.utils.deepClone(region.getFlag(ID,'ledger')??{}),entry=ledger[actorKey(r.identity??r.actorUUID,r.source)];if(entry?.requestId===m.id){entry.outcome=r.outcome;if(entry.queuedLeaveKey)followups.push(entry.queuedLeaveKey);await region.setFlag(ID,'ledger',ledger);}}
 await update(m,r);
 if(followups.length){const token=await fromUuid(r.targetUUID);if(token)for(const key of new Set(followups))await trigger(r.source,token,'leave',key);}
}
async function askClaim(messageId,nonce,choice){
 if(gm())return enqueue(()=>claim({messageId,nonce,choice,userId:game.user.id}));
 if(!game.users.activeGM)throw Error('An active GM is needed to coordinate this save.');
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{waiters.delete(nonce);reject(Error('The GM did not respond. The save remains pending.'));},10000);waiters.set(nonce,value=>{clearTimeout(timer);resolve(value);});emit({op:'claim',messageId,nonce,choice});});
}
export async function rollSave(messageId,event,choice=0){
 const m=game.messages.get(messageId),r=req(m);if(!r||!owner(r,game.user)||rolling.has(messageId))return null;
 rolling.add(messageId);const nonce=foundry.utils.randomID();
 try{
  const grant=await askClaim(messageId,nonce,choice);if(!grant.granted)return null;
  const actor=await fromUuid(r.actorUUID),origin=sourceActor(r.source),item=await sourceItem(r.source);
  if(!actor||!origin||!item)throw Error('The source or saving creature is unavailable.');
  const context=behavior(r.source.profile,r.event),safe=context.spellRank?new CONFIG.Item.documentClass({_id:item.id,name:r.label,type:'spell',img:item.img,system:{level:{value:context.spellRank},location:{heightenedLevel:context.spellRank},traits:{value:r.source.traits.filter(t=>t in CONFIG.PF2E.spellTraits),traditions:r.source.traits.filter(t=>['arcane','divine','occult','primal'].includes(t))},description:{value:''}}},{parent:origin}):item.clone({name:r.label,'system.description.value':'',...(item.isOfType('spell')?{'system.traits.value':r.source.traits.filter(t=>t in CONFIG.PF2E.spellTraits)}:{})},{keepId:true});let message;
  const p=behavior(r.source.profile,r.event),attack=p.attack,statistic=attack?item.spellcasting?.statistic?.withRollOptions({item:safe}):grant.save==='flat'?new actor.saves.reflex.constructor(actor,{slug:'flat',label:game.i18n.localize('PF2E.FlatCheck'),domains:['flat-check'],check:{type:'flat-check'}}):actor.getStatistic(grant.save);if(!statistic)throw Error('The required casting statistic is unavailable.');const roll=await statistic.check.roll({dc:{value:grant.dc,...(attack?{slug:attack}:{})},...(!attack?{token:await fromUuid(r.targetUUID)}:{}),...(attack?{target:actor}:{origin}),...(p.rollTwice?{rollTwice:p.rollTwice}:{}),...(p.messageMode?{messageMode:p.messageMode}:{}),item:safe,event,extraRollOptions:[...sourceOptions(r.source),...(grant.options??[]),'area-trigger:request:'+messageId],callback:(_roll,_outcome,m)=>{message=m;}});
  if(!roll||!message){if(gm())await enqueue(()=>release({messageId,nonce,userId:game.user.id}));else emit({op:'release',messageId,nonce});return null;}
  const data={op:'result',messageId,nonce,rollId:message.id,userId:game.user.id};if(gm())await enqueue(()=>resolve(data));else emit(data);return message;
 }catch(error){if(gm())await enqueue(()=>release({messageId,nonce,userId:game.user.id}));else emit({op:'release',messageId,nonce});throw error;}
 finally{rolling.delete(messageId);}
}
export async function damage(messageId,event,choice=0,inputs=null){
 const m=game.messages.get(messageId),r=req(m),p=r&&behavior(r.source.profile,r.event);if(!r||!(['resolved','ready'].includes(r.status)||p.independentDamage&&r.status==='pending')||r.damageRolled||!(p.basic||p.damageSave||p.directDamage||p.independentDamage)||!factor(r))return null;
 const caster=sourceActor(r.source);if(!game.user.isGM&&!caster?.isOwner)throw Error('The caster or GM rolls damage.');
 if(req(m)?.damageRolled)return null;
 if(!gm()){emit({op:'damage',messageId,choice,inputs});return null;}
 const item=await sourceItem(r.source);if(!item)throw Error('Source item unavailable.');
 const previousStatus=r.status;r.damageRolled=true;if(behavior(r.source.profile,r.event).attack&&!r.attackAttempted){r.status='resolved';r.attackBypassed=true;}await update(m,r);
 try{
  const p=behavior(r.source.profile,r.event);
  const DamageRoll=CONFIG.Dice.rolls.find(c=>c.name==='DamageRoll');
  const adjusted=async formula=>{let roll=await new DamageRoll(formula).evaluate();const casterAdjustment=caster.isOfType('npc')?(caster.isElite?2:caster.isWeak?-2:0):0,delta=r.source.damageAdjustment??casterAdjustment*(item.getRollOptions('item').includes('item:frequency:limited')?2:1);if(delta)roll=roll.alter(1,delta);return roll;};
  if(p.directDamage){const roll=await adjusted(p.damageChoices?.[choice]?.formula(r.source.rank,r.source,r)??p.directDamage(r.source.rank,r.source,r));await roll.toMessage({speaker:ChatMessage.getSpeaker({actor:caster}),flavor:esc(r.label)+': ongoing effect (no save)',flags:{pf2e:{origin:item.getOriginData(),context:{type:'damage-roll',sourceType:'check',options:sourceOptions(r.source),outcome:null}}}});return roll;}
  if(item.isOfType('spell')&&!p.damageFormula&&!p.damageChoices&&!p.damageExpression){const roll=await item.rollDamage(event??{target:document.body});if(!roll){r.damageRolled=false;await update(m,r);}return roll;}
  const index=p.damageIndicesByOutcome?.[r.outcome],extra=p.extraDamageIndicesByOutcome?.[r.outcome];let formula=Number.isInteger(index)?nativeDamage(item,index):p.damageChoices?.[choice]?.formula(r.source.rank,r.source,r)??p.damageFormula?.(r.source.rank,r.source,r)??(p.damageExpression?nativeDamage(item,0,p.damageExpression):null)??r.source.damage??p.damage;
  if(Number.isInteger(extra))formula+=','+nativeDamage(item,extra);
  const roll=await adjusted(formula);await roll.toMessage({speaker:ChatMessage.getSpeaker({actor:caster}),flavor:`${esc(r.label)}: use ${factor(r)===0.5?'half':factor(r)===2?'double':'full'} damage`,flags:{pf2e:{suppressDamageButtons:!!p.suppressDamageButtons,origin:item.getOriginData(),context:{type:'damage-roll',sourceType:p.attack?'attack':p.independentDamage?'check':'save',options:sourceOptions(r.source),outcome:null}}}});return roll;
 }catch(e){r.damageRolled=false;r.status=previousStatus;r.attackBypassed=false;await update(m,r);throw e;}
}
export function listenSocket(){game.socket.on(socket,data=>{
 if(data.op==='claimReply'&&data.recipient===game.user.id){waiters.get(data.nonce)?.(data);waiters.delete(data.nonce);return;}
 if(!gm())return;
 enqueue(async()=>{
  if(data.op==='claim'){const result=await claim(data);game.socket.emit(socket,{op:'claimReply',recipient:data.userId,nonce:data.nonce,...result});}
  if(data.op==='release')await release(data);
  if(data.op==='result')await resolve(data);
  if(data.op==='setDC'){const r=req(game.messages.get(data.messageId)),a=r&&await fromUuid(r.source.actorUUID),u=game.users.get(data.userId);if(a&&u&&(u.isGM||a.testUserPermission(u,'OWNER')))await setDC(data.messageId,data.value);}
  if(data.op==='pulse')await pulse(data.messageId,data.userId,data.choices,data.targetUUIDs);
  if(data.op==='approve'&&game.users.get(data.userId)?.isGM)await approve(data.messageId,data.userId);
 if(data.op==='haunt'&&game.users.get(data.userId)?.isGM)await activateHaunt(data.messageId,data.userId,data.targets);
  if(data.op==='damage'){const r=req(game.messages.get(data.messageId)),actor=r&&await fromUuid(r.source.actorUUID),u=game.users.get(data.userId);if(u&&(u.isGM||actor?.testUserPermission(u,'OWNER')))await damage(data.messageId,undefined,data.choice??0,data.inputs??null);}
 });
});}
export function chatListeners(message,html){
 if(!req(message)&&message.item?.isOwner&&profileFor(message.item)?.customArea&&(profileFor(message.item).kind==='area'||message.flags.pf2e?.casting)){const root=html instanceof HTMLElement?html:html[0],button=document.createElement('button');button.type='button';button.textContent=message.item.isOfType('spell')?'Link drawn spell area':'Link drawn ability area';button.addEventListener('click',async()=>{try{const regions=canvas.scene.regions.filter(r=>r.isOwner&&r.shapes.length&&!binding(r)&&!r.flags.pf2e?.origin);if(!regions.length){ui.notifications.info('Draw the effect area with the native Region tools, then link it here.');return;}const selected=await foundry.applications.api.DialogV2.prompt({window:{title:'Link effect area'},content:'<label>Drawn area<select name="area">'+regions.map(r=>`<option value="${esc(r.uuid)}">${esc(r.name)}</option>`).join('')+'</select></label>'+(profileFor(message.item).areaModes?'<label>Effect<select name="mode">'+profileFor(message.item).areaModes.map(m=>`<option value="${esc(m.id)}">${esc(m.label)}</option>`).join('')+'</select></label>':''),ok:{label:'Link area',callback:(_e,b)=>({area:b.form.elements.area.value,mode:b.form.elements.mode?.value??null})},rejectClose:false});if(typeof selected?.area==='string')await linkArea(message.id,selected.area,selected.mode);}catch(error){ui.notifications.warn(error.message);}});root.append(button);}
 const root=html instanceof HTMLElement?html:html[0],r=req(message);if(!r){const item=message.item,p=item&&profileFor(item);if(game.user.isGM&&item?.actor&&(item.actor.isOfType('hazard')||p?.requireGMLive)&&p){const label=document.createElement('label');label.textContent='Area prompts ';const select=document.createElement('select');select.dataset.areaLive='';for(const[value,text]of[['auto','Live when in initiative'],['live','Live during encounters'],['paused','Paused']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}select.value=item.getFlag(ID,'liveMode')??'auto';select.addEventListener('change',()=>setSourceLive(item.uuid,select.value).catch(e=>ui.notifications.warn(e.message)));label.append(select);root.append(label);}if(game.user.isGM&&p?.hauntRoot){const button=document.createElement('button');button.type='button';button.textContent='GM: activate linked areas';button.addEventListener('click',()=>{button.disabled=true;enqueue(()=>activateHaunt(message.id)).catch(e=>ui.notifications.warn(e.message)).finally(()=>{button.disabled=false;});});root.append(button);}if(game.user.isGM&&p?.clockUI){const button=document.createElement('button');button.type='button';button.textContent='Schedule linked field';button.addEventListener('click',()=>chooseAreaSchedule(message).catch(e=>ui.notifications.warn(e.message)));root.append(button);}if(p?.events.includes('sustain')&&(message.flags.pf2e?.casting||p.kind==='area')&&item.isOwner){const b=document.createElement('button');b.type='button';b.textContent=p.sustainLabel??'Sustain: prompt current area';b.addEventListener('click',()=>enqueue(()=>p.pulseChoices?choosePulseEffects(message.id):pulse(message.id)).catch(e=>ui.notifications.warn(e.message)));root.append(b);}if(p?.activation==='manual'&&item.isOwner){const button=document.createElement('button');button.type='button';const refresh=()=>{const active=item.getFlag(ID,'active');button.textContent=active?.enabled&&(!active.expiresAt||active.expiresAt>now())?'End area prompts':'Activate area prompts';};refresh();button.addEventListener('click',async()=>{button.disabled=true;try{await setActive(item.uuid,button.textContent==='Activate area prompts');refresh();}catch(e){ui.notifications.warn(e.message);}finally{button.disabled=false;}});root.append(button);}return;}
 root.querySelector('[data-area-haunt]')?.addEventListener('click',event=>{const button=event.currentTarget;button.disabled=true;enqueue(()=>activateHaunt(message.id)).catch(e=>ui.notifications.warn(e.message)).finally(()=>{if(button.isConnected)button.disabled=false;});});
 root.querySelector('[data-area-approve]')?.addEventListener('click',e=>{e.currentTarget.disabled=true;enqueue(()=>approve(message.id)).catch(err=>ui.notifications.warn(err.message));});
 root.querySelector('[data-area-set-dc]')?.addEventListener('click',()=>setDC(message.id,root.querySelector('[data-area-dc]').value).catch(err=>ui.notifications.warn(err.message)));
 for(const save of root.querySelectorAll('[data-area-save]')){const choice=(r.source.checkChoices??[{dc:r.source.dc}])[Number(save.dataset.areaSave)||0];save.disabled=!owner(r,game.user)||!Number.isFinite(choice?.dc)||choice.dc<1;save.addEventListener('click',e=>{save.disabled=true;rollSave(message.id,e,Number(save.dataset.areaSave)||0).catch(err=>ui.notifications.warn(err.message)).finally(()=>{if(save.isConnected)save.disabled=!owner(req(message),game.user);});});}
 for(const button of root.querySelectorAll('[data-area-damage]'))button.addEventListener('click',e=>damage(message.id,e,Number(button.dataset.areaDamage)||0).catch(err=>ui.notifications.warn(err.message)));
}

const auraMoves=new Map(),squareMoves=new Map(),movementOrigins=new Map();
function enteredHazardSquares(region,probe,waypoints){
 const size=region.parent.grid.size,cells=position=>{const token=probe.at(position),b=token.mechanicalBounds,start=canvas.grid.getOffset({x:b.x+Math.min(b.width,size)/2,y:b.y+Math.min(b.height,size)/2}),out=new Set();for(let i=0;i<Math.max(1,Math.round(b.height/size));i++)for(let j=0;j<Math.max(1,Math.round(b.width/size));j++){const offset={i:start.i+i,j:start.j+j},center=canvas.grid.getCenterPoint(offset);if(token.testInsideRegion(region,{x:center.x-size/2,y:center.y-size/2,width:1,height:1}))out.add(offset.i+':'+offset.j);}return out;};
 let previous=cells(waypoints[0]),count=0;const visit=position=>{const next=cells(position);for(const cell of next)if(!previous.has(cell))count++;previous=next;};
 for(let i=1;i<waypoints.length;i++){const a=waypoints[i-1],b=waypoints[i];if(CONFIG.Token.movement.actions[b.action]?.teleport){visit(b);continue;}const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/(size/2)));for(let j=1;j<=steps;j++)visit({x:a.x+(b.x-a.x)*j/steps,y:a.y+(b.y-a.y)*j/steps,elevation:(a.elevation??probe.document.elevation)+((b.elevation??probe.document.elevation)-(a.elevation??probe.document.elevation))*j/steps});}
 return count;
}
export function captureAuraMove(token,movement){
 if(!gm()||!enabled()||!canvas.ready||!startedEncounter(token.parent)||token.parent.id!==canvas.scene.id)return;
 const sources=auraSources(canvas.scene).filter(s=>!isSourceTarget(s,token)&&profiles[s.profile].events.some(e=>['enter','leave','teleport','move'].includes(e)));
 for(const region of canvas.scene.regions){const s=binding(region);if(s&&(profiles[s.profile]?.shellThickness||profiles[s.profile]?.countEnteredSquares)&&!region.hidden&&region.behaviors.some(b=>b.type===ID+'.trigger'&&!b.disabled))sources.push(s);}
 if(!sources.length)return;
 const origin=movement.origin??{x:token.x,y:token.y},destination=movement.destination??movement.passed?.waypoints?.at(-1)??movement.waypoints?.at(-1);if(!destination)return;
 const path=movement.passed?.waypoints??movement.waypoints??[];const waypoints=[origin,...path];if(waypoints.length<2)waypoints.push(destination);const crossed=[];
 const moveId=movement.subpathId??movement.id??foundry.utils.randomID();let originState=movementOrigins.get(token.uuid);if(originState?.id!==moveId){originState={id:moveId,origin:{...origin},inside:new Map()};movementOrigins.set(token.uuid,originState);}
 const probe=movementProbe(token);
 try{for(const s of sources){
  if(profiles[s.profile].countEnteredSquares){crossed.push({source:s,event:'move',enteredSquares:enteredHazardSquares(fromUuidSync(s.instance),probe,waypoints)});continue;}
  const contains=position=>s.kind==='region'?probe.at(position).testInsideRegion(fromUuidSync(s.instance)):s.aura.containsToken(probe.at(position));
  if(profiles[s.profile].moveEndOnly){const pending=movement.pending?.waypoints?.length,walked=waypoints.slice(1).some(p=>!CONFIG.Token.movement.actions[p.action]?.teleport),moved=['x','y','elevation'].some(k=>(origin[k]??token[k])!==(destination[k]??token[k]));if(!pending&&walked&&moved&&contains(destination))crossed.push({source:s,event:'move'});continue;}
  let inside=contains(origin);const events=new Set(),supported=profiles[s.profile].events;
  if(!originState.inside.has(s.instance))originState.inside.set(s.instance,contains(originState.origin));
  if(originState.inside.get(s.instance)&&supported.includes('move')&&waypoints.slice(1).some(p=>!CONFIG.Token.movement.actions[p.action]?.teleport))events.add('move');
  const transition=next=>{if(!inside&&next)events.add('enter');if(inside&&!next)events.add('leave');inside=next;};
  for(let i=1;i<waypoints.length;i++){const a=waypoints[i-1],b=waypoints[i];if(CONFIG.Token.movement.actions[b.action]?.teleport){const next=contains(b);if(inside||next)events.add('teleport');transition(next);continue;}const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/(canvas.grid.size/2)));for(let j=1;j<=steps;j++)transition(contains({x:a.x+(b.x-a.x)*j/steps,y:a.y+(b.y-a.y)*j/steps,elevation:(a.elevation??token.elevation)+((b.elevation??token.elevation)-(a.elevation??token.elevation))*j/steps}));}
  for(const event of events)if(supported.includes(event))crossed.push({source:s,event});
 }}finally{probe.dispose();}
 auraMoves.set(token.uuid,{id:movement.subpathId??movement.id??foundry.utils.randomID(),pending:!!movement.pending?.waypoints?.length,sources:crossed});
}
export async function finishAuraMove(token){
 const movement=auraMoves.get(token.uuid);if(!movement)return;auraMoves.delete(token.uuid);
 let squares=squareMoves.get(token.uuid);const flush=async record=>{for(const {source,count} of record.sources.values())if(count&&fromUuidSync(source.instance))await trigger(source,token,'move',record.id,{enteredSquares:count});};
 if(squares&&squares.id!==movement.id){await flush(squares);squareMoves.delete(token.uuid);squares=null;}
 for(const {source,event,enteredSquares} of movement.sources)if(enteredSquares===undefined)await trigger(source,token,event,movement.id);else{if(!squares){squares={id:movement.id,sources:new Map()};squareMoves.set(token.uuid,squares);}const prior=squares.sources.get(source.instance);squares.sources.set(source.instance,{source,count:(prior?.count??0)+enteredSquares});}
 if(squares&&!movement.pending){await flush(squares);squareMoves.delete(token.uuid);}if(!movement.pending)movementOrigins.delete(token.uuid);
}

export function forgetMovement(token){auraMoves.delete(token.uuid);squareMoves.delete(token.uuid);movementOrigins.delete(token.uuid);}
export async function activatedAura(item){
 if(!gm()||!canvas.ready||!enabled())return;
 for(const s of auraSources(canvas.scene))if(s.itemUUID===item.uuid&&profiles[s.profile].events.includes('activate'))for(const target of canvas.scene.tokens)if((!isSourceTarget(s,target)||profiles[s.profile].includeSelf)&&s.aura.containsToken(target))await trigger(s,target,'activate',item.uuid+':'+now());
}

export async function setDC(messageId,value){
 const m=game.messages.get(messageId),r=req(m),actor=r&&await fromUuid(r.source.actorUUID),dc=Number(value);
 if(!r||!actor||!Number.isInteger(dc)||dc<1||dc>100)throw Error('Enter a valid DC.');
 if(!game.user.isGM&&!actor.isOwner)throw Error('Only the GM or source owner can set this DC.');
 if(!gm()){emit({op:'setDC',messageId,value:dc});return;}
 const item=await fromUuid(r.source.itemUUID);if(item)await item.setFlag(ID,'dc',dc);r.source.dc=dc;if(r.source.checkChoices)r.source.checkChoices=r.source.checkChoices.map(c=>({...c,dc:Number.isFinite(c.dc)&&c.dc>0?c.dc:dc}));await update(m,r);
}

const sweepWindow=()=>game.combat?.started?game.combat.id+':'+game.combat.round:'time:'+Math.floor(now()/6);
function sweepFractions(before,after,points=[],walls=[]){
 const dx=after.x-before.x,dy=after.y-before.y,size=canvas.grid.size,center=canvas.grid.getCenterPoint({i:0,j:0}),fractions=new Set([0,1]),cross=(ax,ay,bx,by)=>ax*by-ay*bx,add=t=>{if(Number.isFinite(t)&&t>=0&&t<=1)fractions.add(t);};
 // PF2e covered squares change at cell-center lines, including isolated corner contacts.
 for(const [a,b,offset] of [[before.x,after.x,center.x],[before.y,after.y,center.y]])if(a!==b)for(let n=Math.ceil((Math.min(a,b)-offset)/size);n<=Math.floor((Math.max(a,b)-offset)/size);n++)add((offset+n*size-a)/(b-a));
 // Visibility can change when the moving origin crosses a wall or a ray through a wall endpoint.
 for(const [x0,y0,x1,y1] of walls){const den=cross(dx,dy,x1-x0,y1-y0);if(den)add(cross(x0-before.x,y0-before.y,x1-x0,y1-y0)/den);for(const point of points)for(const [x,y] of [[x0,y0],[x1,y1]]){const rayDen=cross(dx,dy,point.x-x,point.y-y);if(rayDen)add(-cross(before.x-x,before.y-y,point.x-x,point.y-y)/rayDen);}}
 const sorted=[...fractions].sort((a,b)=>a-b);return [...sorted,...sorted.slice(1).map((t,i)=>(t+sorted[i])/2)];
}
export async function recordRegionSweep(region,previousShapes){
 if(!gm()||!enabled()||region.hidden||region.parent!==canvas.scene)return;
 const s=binding(region),p=profiles[s?.profile],before=previousShapes?.[0],after=region.shapes[0];if(!p?.sweptArea||!before||!after||previousShapes.length!==1||region.shapes.length!==1||before.type!=='circle'||after.type!=='circle'||before.x===after.x&&before.y===after.y)return;
 const prior=region.getFlag(ID,'sweep'),window=sweepWindow(),affected=new Set(prior?.window===window?prior.targets:[]),size=canvas.grid.size,radius=Math.max(before.radius,after.radius)+size,bounds=new PIXI.Rectangle(Math.min(before.x,after.x)-radius,Math.min(before.y,after.y)-radius,Math.abs(after.x-before.x)+2*radius,Math.abs(after.y-before.y)+2*radius),targets=region.parent.tokens.filter(t=>t.actor?.isOfType('creature')&&bounds.intersects(t.mechanicalBounds));
 const sample=(fractions,tokens)=>{for(const t of fractions){const shape={...before,x:before.x+(after.x-before.x)*t,y:before.y+(after.y-before.y)*t},document=region.clone({shapes:[shape]},{keepId:true,parent:region.parent});for(const token of tokens)if(!affected.has(token.uuid)&&token.testInsideRegion(document))affected.add(token.uuid);if(tokens.every(token=>affected.has(token.uuid)))break;}};
 sample(sweepFractions(before,after),targets);
 const walls=[...region.parent.walls].map(w=>w.c).filter(c=>Array.isArray(c)&&c.length===4&&Math.max(c[0],c[2])>=bounds.left&&Math.min(c[0],c[2])<=bounds.right&&Math.max(c[1],c[3])>=bounds.top&&Math.min(c[1],c[3])<=bounds.bottom);
 if(walls.length)for(const token of targets)if(!affected.has(token.uuid)){const b=token.mechanicalBounds,{i,j}=canvas.grid.getOffset({x:b.x+Math.min(b.width,size)/2,y:b.y+Math.min(b.height,size)/2}),points=Array.from({length:Math.max(1,Math.round(b.height/size))},(_,row)=>Array.from({length:Math.max(1,Math.round(b.width/size))},(_,col)=>canvas.grid.getCenterPoint({i:i+row,j:j+col}))).flat();sample(sweepFractions(before,after,points,walls),[token]);}
 await region.setFlag(ID,'sweep',{window,targets:[...affected]});
}
export async function pulse(messageId,userId=game.user.id,choices=null,targetUUIDs=null){
 if(!startedEncounter(canvas.scene)){ui.notifications.info('Start an encounter to use automatic area prompts.');return;}
 const message=game.messages.get(messageId),item=message?.item,user=game.users.get(userId),p=item&&profileFor(item);
 if(!p?.events.includes('sustain')||!item?.actor||!user||!user.isGM&&!item.actor.testUserPermission(user,'OWNER'))return;
 const regions=canvas.scene.regions.filter(region=>binding(region)?.messageId===messageId&&!region.hidden&&region.behaviors.some(b=>b.type===ID+'.trigger'&&!b.disabled));
 if(!regions.length){if(game.user.id===userId)ui.notifications.info('Place an active area for this spell before prompting its effect.');return;}
 const eligible=regions.filter(region=>{const s=binding(region),sameCombat=s.castCombat&&s.castCombat.id===game.combat?.id;return !(p.sustainAfterCastRound&&sameCombat&&game.combat.round<=s.castCombat.round&&!(p.initialSweep&&s.initialSweepPending)&&!(p.initialPulse&&s.initialPulsePending))&&!(p.sustainAfterCastTurn&&sameCombat&&game.combat.round===s.castCombat.round&&game.combat.turn===s.castCombat.turn)&&(!p.sweptArea||region.getFlag(ID,'sweep')?.window===sweepWindow());});
 if(!eligible.length){if(game.user.id===userId)ui.notifications.info(p.sweptArea?'Move the area before prompting its sweep.':'This effect starts on a subsequent round.');return;}
 if(!gm()){emit({op:'pulse',messageId,choices,targetUUIDs});return;}
 if(p.pulseChoices)return chosenPulse(p,eligible,user,choices,targetUUIDs);
 if(p.sustainOnlyExtend){for(const region of eligible){const source=binding(region);if(!sourceLive(source)||!active(source))continue;const combat=startedEncounter(region.parent),owner=combat.turns.findIndex(c=>c.actor?.uuid===source.actorUUID);if(owner<0){ui.notifications.warn('Put the source in initiative before extending its turn deadline.');continue;}await region.setFlag(ID,'binding.sourceEndExpiry',{combatId:combat.id,round:combat.round+(owner<=combat.turn?1:0)});}return;}
 if(p.sustainAugment){const window=sweepWindow()+':'+(game.combat?.combatant?.id??'');for(const region of eligible){if(region.getFlag(ID,'augmentWindow')===window)continue;const s=binding(region),die=Math.min(12,(s.entropyDie??6)+2),scale=region.parent.grid.size/region.parent.grid.distance;await region.update({shapes:region.shapes.map(shape=>shape.type==='circle'?{...shape,radius:Math.min(40*scale,shape.radius+10*scale)}:shape),[`flags.${ID}.binding.entropyDie`]:die,[`flags.${ID}.augmentWindow`]:window});}return;}
 const key=foundry.utils.randomID();
 for(const region of eligible){const s=binding(region),sweep=p.sweptArea?region.getFlag(ID,'sweep'):null;for(const token of canvas.scene.tokens)if(sweep?sweep.targets.includes(token.uuid):token.testInsideRegion(region))await trigger(s,token,'sustain',key);if(sweep)await region.unsetFlag(ID,'sweep');if(s.initialSweepPending)await region.setFlag(ID,'binding.initialSweepPending',false);}
}

async function choosePulseEffects(messageId){
 const p=profileFor(game.messages.get(messageId)?.item);if(!p?.pulseChoices)return;
 const limit=p.pulseLimit??1,content=limit===1?'<label>Effect<select name="choice">'+p.pulseChoices.map(c=>`<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('')+'</select></label>':'<p>Choose up to '+limit+' different effects.</p>'+p.pulseChoices.map(c=>`<label><input type="checkbox" name="choice" value="${esc(c.id)}"> ${esc(c.label)}</label>`).join('');
 const choices=await foundry.applications.api.DialogV2.prompt({window:{title:'Choose spell effect'},content,ok:{label:'Prompt effect',callback:(_event,button)=>limit===1?[button.form.elements.choice.value]:[...button.form.querySelectorAll('[name="choice"]:checked')].map(e=>e.value)},rejectClose:false});
 if(!Array.isArray(choices)||!choices.length)return;if(choices.length>limit){ui.notifications.warn('Choose at most '+limit+' effects.');return;}
 return pulse(messageId,game.user.id,choices,[...game.user.targets].map(t=>t.document.uuid));
}
function pulseContains(region,token,p){
 let area=region;
 if(p.radiusIncrement||p.radiusOverride){const scale=region.parent.grid.size/region.parent.grid.distance;area=region.clone({shapes:region.shapes.map(s=>['circle','emanation'].includes(s.type)?{...s,radius:p.radiusOverride?p.radiusOverride*scale:s.radius+p.radiusIncrement*scale}:s)},{keepId:true,parent:region.parent});}
 if(!token.testInsideRegion(area))return false;
 if(p.excludeFullyInside){const b=token.mechanicalBounds,size=region.parent.grid.size,rows=Math.max(1,Math.ceil(b.height/size)),columns=Math.max(1,Math.ceil(b.width/size));let fully=true;for(let i=0;i<rows&&fully;i++)for(let j=0;j<columns;j++)if(!token.testInsideRegion(region,{x:b.x+j*size,y:b.y+i*size,width:1,height:1})){fully=false;break;}if(fully)return false;}
 return true;
}
async function chosenPulse(p,regions,user,choices,targetUUIDs){
 if(!Array.isArray(choices)||!choices.length||choices.length>(p.pulseLimit??1)||new Set(choices).size!==choices.length||choices.some(id=>!p.pulseChoices.some(c=>c.id===id))){ui.notifications.warn('Choose the permitted number of different spell effects.');return;}
 const leader=regions[0],source=binding(leader),prior=leader.getFlag(ID,'pulseChoiceState'),combat=game.combat,window=combat?.started&&combat.scene?.id===canvas.scene.id?combat.id+':'+combat.round:'time:'+Math.floor(now()/6),initial=source.initialPulsePending&&(!source.castCombat||source.castCombat.id===combat?.id&&source.castCombat.round===combat.round);
 if(p.pulseFrequency==='round'&&prior?.window===window&&!initial){ui.notifications.warn('This casting already used its first Sustain effect this round.');return;}
 if(p.noConsecutiveChoice&&choices.some(id=>prior?.choices?.includes(id))){ui.notifications.warn('Choose a different effect from the previous display.');return;}
 const selected=[...new Set(targetUUIDs??[])].map(uuid=>canvas.scene.tokens.find(t=>t.uuid===uuid)).filter(Boolean),plans=[];
 for(const id of choices){const childId=p.id+'-'+id,child=profiles[childId];let targets;
  if(child.selectedTargets){if(!selected.length||selected.length>(child.maxTargets??Infinity)){ui.notifications.warn('Target between one and '+(child.maxTargets??'the eligible')+' creatures before choosing this effect.');return;}targets=selected.filter(t=>regions.some(r=>pulseContains(r,t,child)));if(targets.length!==selected.length){ui.notifications.warn('Every selected target must be inside this effect\'s permitted area.');return;}}
  else if(child.selfPulse)targets=canvas.scene.tokens.filter(t=>t.actor?.uuid===source.actorUUID).slice(0,1);
  else targets=canvas.scene.tokens.filter(t=>regions.some(r=>pulseContains(r,t,child)));
  plans.push({childId,child,targets});
 }
 for(const region of regions){for(const {child} of plans)if(child.areaState){const scale=region.parent.grid.size/region.parent.grid.distance;await region.update({shapes:region.shapes.map(s=>['circle','emanation'].includes(s.type)?{...s,radius:child.areaState.radius*scale}:s),[`flags.${ID}.binding.fieldState`]:child.areaState.id});}await region.setFlag(ID,'pulseChoiceState',{window:initial?null:window,choices});if(binding(region).initialPulsePending)await region.setFlag(ID,'binding.initialPulsePending',false);}
 const key=foundry.utils.randomID();
 for(const {childId,child,targets} of plans)for(const target of targets){const region=regions.find(r=>child.selfPulse||pulseContains(r,target,child))??leader,s={...binding(region),profile:childId,name:source.name+': '+child.modeLabel,options:[...source.options,...(child.basic||child.attack||child.directDamage?['damaging-effect']:[])]};await trigger(s,target,'sustain',key);}
}

export async function approve(messageId,userId=game.user.id){
 const message=game.messages.get(messageId),r=req(message),user=game.users.get(userId),p=r&&behavior(r.source.profile,r.event);if(!user?.isGM||!p?.gmDecision||r.approved||r.status!=='notice'||!active(r.source))return;
 if(!gm()){emit({op:'approve',messageId});return;}
 r.approved=true;r.status='pending';const target=await fromUuid(r.targetUUID);
 await message.update({whisper:target?.hidden||p.gmOnly?ChatMessage.getWhisperRecipients('GM').map(u=>u.id):[],content:renderCard(r),[`flags.${ID}.request`]:r});
}

export async function activateHaunt(messageId,userId=game.user.id,selectedTargets=null){
 const user=game.users.get(userId);if(!user?.isGM||!enabled())return false;
 if(!startedEncounter(canvas.scene)){ui.notifications.info('Start the encounter before activating hazard area prompts.');return false;}
 const message=game.messages.get(messageId),request=req(message);let source=request?.source;
 if(!source){const region=canvas.scene.regions.find(r=>binding(r)?.messageId===messageId&&profiles[binding(r).profile]?.hauntRole==='trigger');source=region&&binding(region);}
 const triggerProfile=profiles[source?.profile],root=profiles[triggerProfile?.hauntRoot];if(!source||!root||request&&request.status!=='notice')return false;
 if(!sourceLive(source)){ui.notifications.info('Add the hazard to initiative or make its area live first.');return false;}
 if(!gm()){emit({op:'haunt',messageId,targets:selectedTargets});return true;}
 const regions=castRegions(source).filter(r=>!r.hidden&&r.behaviors.some(b=>b.type===ID+'.trigger'&&!b.disabled)),explicit=regions.filter(r=>profiles[binding(r).profile]?.hauntRole==='effect'),triggers=regions.filter(r=>profiles[binding(r).profile]?.hauntRole==='trigger');
 for(const mode of root.requiredEffectModes??[])if(!explicit.some(r=>binding(r).profile===triggerProfile.hauntRoot+'-'+mode)){ui.notifications.warn('Link the affected '+mode+' area before activating this hazard.');return false;}
 let areas=explicit.map(region=>({region,source:binding(region)}));
 if(root.effectFromTrigger&&!areas.length||root.fallbackEffectMode){const mode=root.fallbackEffectMode??'effect',id=triggerProfile.hauntRoot+'-'+mode;if(!areas.some(area=>area.source.profile===id))for(const region of triggers){const original=binding(region),item=await sourceItem(original);if(item)areas.push({region,source:{...original,...abilityMechanics(item,profiles[id]),profile:id,name:item.name+': '+profiles[id].modeLabel,options:[...(profiles[id].options??[]),...(profiles[id].basic||profiles[id].damageSave?['damaging-effect']:[])]}});}}
 if(root.hauntHasEffect&&!areas.length){ui.notifications.warn('Link the affected area before activating this hazard.');return false;}
 const plans=new Map();for(const area of areas){const p=profiles[area.source.profile];for(const target of canvas.scene.tokens){if(!target.actor?.isOfType('creature')||target.actor.isDead||!target.testInsideRegion(area.region)||p.targetMode&&target.actor.modeOfBeing!==p.targetMode||p.excludeTargetTraits?.some(trait=>target.actor.system.traits.value.includes(trait)))continue;const key=identity(target),prior=plans.get(key);if(!prior||(p.resolutionPriority??0)>(profiles[prior.source.profile].resolutionPriority??0))plans.set(key,{source:area.source,target});}}
 if(areas.some(area=>profiles[area.source.profile].manualTargets)&&selectedTargets===null){const choices=[...plans.values()],selection=await foundry.applications.api.DialogV2.prompt({window:{title:'Choose affected creatures'},content:'<p>Choose the actual eligible intruders; other eligibility and riders are table managed.</p>'+choices.map(({target})=>'<label><input type="checkbox" name="target" value="'+esc(target.uuid)+'" checked> '+esc(target.name)+'</label>').join(''),ok:{label:'Post save prompts',callback:(_e,button)=>[...button.form.querySelectorAll('[name="target"]:checked')].map(input=>input.value)},rejectClose:false});if(!Array.isArray(selection))return false;selectedTargets=selection;}
 if(selectedTargets!==null&&(!Array.isArray(selectedTargets)||selectedTargets.some(uuid=>![...plans.values()].some(plan=>plan.target.uuid===uuid)))){ui.notifications.warn('Choose creatures inside the linked affected areas.');return false;}
 const key='haunt:'+messageId+':'+foundry.utils.randomID();for(const plan of plans.values())if(selectedTargets===null||selectedTargets.includes(plan.target.uuid))await trigger(plan.source,plan.target,'activate',key);
 if(request){request.status='resolved';await update(message,request);}else if(!root.hauntHasEffect)ui.notifications.info('Hazard activation acknowledged. Resolve its Strike, initiative and other effects at the table.');
 return true;
}


// Schedule only area prompts. Actions, charges, fuses, death and riders stay manual.
export async function scheduleArea(regionUUID,combatantId,phase='end',delayRounds=1){
 if(!game.user.isGM)throw Error('Only the GM can schedule an area.');
 const region=await fromUuid(regionUUID),s=binding(region),p=profiles[s?.profile],enc=startedEncounter(region?.parent),combatant=enc?.combatants.get(combatantId);
 if(!s||!p?.clockUI||!enc||!combatant||!['start','end'].includes(phase)||!Number.isInteger(delayRounds)||delayRounds<1||delayRounds>100)throw Error('Choose a linked scheduled area and a combatant in the started encounter.');
 if(p.crewDeadline&&phase!=='end')throw Error('Crew attacks resolve at the second crew member\'s turn end.');
 const index=enc.turns.findIndex(c=>c.id===combatant.id),round=enc.round+(phase==='start'?index<=enc.turn:index<enc.turn)+delayRounds-1;
 await region.update({[`flags.${ID}.binding.clockDeadline`]:{id:foundry.utils.randomID(),combatId:enc.id,combatantId,round,phase},[`flags.${ID}.binding.clockFired`]:false});
 const updates=region.behaviors.filter(b=>b.type===ID+'.trigger').map(b=>({_id:b.id,disabled:false}));if(updates.length)await region.updateEmbeddedDocuments('RegionBehavior',updates);
}
export async function runScheduled(combatant,encounter,event,round=encounter.round){
 if(!gm()||!enabled()||!canvas.ready||!startedEncounter(canvas.scene)||encounter.scene?.id!==canvas.scene.id)return;
 for(const region of [...canvas.scene.regions]){
  const s=binding(region),clock=s?.clockDeadline,p=profiles[s?.profile];if(!clock||s.clockFired||clock.combatId!==encounter.id||clock.combatantId!==combatant.id||clock.phase!==event||clock.round>round||region.hidden||!sourceLive(s,region.parent)||!region.behaviors.some(b=>b.type===ID+'.trigger'&&!b.disabled))continue;
  if(p.clockActivateOnly){await region.update({[`flags.${ID}.binding.clockDeadline`]:null,[`flags.${ID}.binding.clockActive`]:true});continue;}
  for(const target of region.parent.tokens)if(target.testInsideRegion(region))await trigger(s,target,'scheduled','clock:'+clock.id,{encounter,combatant});
  await region.setFlag(ID,'binding.clockFired',true);
  // Retain the source snapshot so already-posted native save/damage buttons work.
  await region.updateEmbeddedDocuments('RegionBehavior',region.behaviors.filter(b=>b.type===ID+'.trigger').map(b=>({_id:b.id,disabled:true})));
 }
}
export async function advanceScheduled(encounter,before){
 if(!before||!encounter.started||!Number.isInteger(before.turn)||!Number.isInteger(encounter.turn)||encounter.round<before.round)return;
 const turns=encounter.turns,n=turns.length;if(!n||before.ids?.length!==n||turns.some((c,i)=>c.id!==before.ids[i]))return;
 const from=before.round*n+before.turn,to=encounter.round*n+encounter.turn;if(to<=from)return;
 // At most the last full round plus the current one is needed for one-shot deadlines.
 // This also notices initiative slots skipped because a source is defeated.
 for(let step=Math.max(from,(encounter.round-1)*n);step<=to;step++){
  const combatant=turns[step%n],round=Math.floor(step/n);
  if(step>from)await runScheduled(combatant,encounter,'start',round);
  if(step<to)await runScheduled(combatant,encounter,'end',round);
 }
}
async function chooseAreaSchedule(message){
 const enc=startedEncounter(canvas.scene),regions=canvas.scene.regions.filter(r=>{const s=binding(r);return s?.messageId===message.id&&profiles[s.profile]?.clockUI;});
 if(!enc||!regions.length){ui.notifications.info('Start an encounter and link the scheduled effect area first.');return;}
 const chosen=await foundry.applications.api.DialogV2.prompt({window:{title:'Schedule area prompt'},content:'<label>Linked area<select name="area">'+regions.map(r=>`<option value="${esc(r.uuid)}">${esc(r.name)}</option>`).join('')+'</select></label><label>Combatant (second crew member for crew attacks)<select name="combatant">'+enc.turns.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')+'</select></label><label>Turn boundary<select name="phase"><option value="end">End of turn</option><option value="start">Start of turn</option></select></label><label>Occurrence<input name="rounds" type="number" min="1" max="100" value="1"></label><p>1 means the next selected boundary. Crew costs, fuses and other requirements remain table managed. Paused sources stay silent.</p>',ok:{label:'Schedule prompt',callback:(_event,button)=>({area:button.form.elements.area.value,combatant:button.form.elements.combatant.value,phase:button.form.elements.phase.value,rounds:Number(button.form.elements.rounds.value)})},rejectClose:false});
 if(chosen)await scheduleArea(chosen.area,chosen.combatant,chosen.phase,chosen.rounds);
}
export async function spellCastAreas(message){
 if(!gm()||!enabled()||!startedEncounter(canvas.scene)||!message.flags.pf2e?.casting||!message.item?.isOfType('spell')||!message.item.actor)return;
 for(const item of message.item.actor.items){const p=profileFor(item);if(p?.activateOnSpellCast)await setActive(item.uuid,true);}
}
