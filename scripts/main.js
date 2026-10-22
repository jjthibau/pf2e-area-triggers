import {setActive,clearGeometry,repairAuraRadii,restoreAuraRadii,invalidateLocalAuraCaches,setEnvironmentTags,renderEnvironmentConfig} from './geometry.js';
import {ID,profiles} from './profiles.js';
import {binding,gm,setSourceLive,enabled,syncFollowingRegions,linkArea} from './sources.js';
import {enqueue,idle,turn,round,enter,reconcile,ended,listenSocket,chatListeners,rollSave,damage,captureAuraMove,finishAuraMove,activatedAura,setDC,pulse,recordRegionSweep,rememberPlacement,trigger,approve,activateHaunt,scheduleArea,advanceScheduled,spellCastAreas,forgetMovement} from './engine.js';
Hooks.once('init',()=>{
 Hooks.on('renderChatMessageHTML',chatListeners);Hooks.on('renderRegionConfig',renderEnvironmentConfig);
 game.settings.register(ID,'enabled',{name:'Enable area trigger prompts',hint:'Area prompts require a started encounter. Hazards must be in initiative or explicitly made live by the GM.',scope:'world',config:true,type:Boolean,default:true,onChange:value=>{if(!value)restoreAuraRadii();else for(const t of canvas.scene?.tokens??[])repairAuraRadii(t);if(gm())enqueue(()=>enabled()?reconcile():clearGeometry());}});
 class TriggerBehavior extends foundry.data.regionBehaviors.RegionBehaviorType{
  events=new Set(['tokenMoveIn','tokenMoveOut','tokenMoveWithin']);static defineSchema(){return {};}
  async _handleRegionEvent(event){if(gm())await enqueue(()=>enter(this.region,event));}
 }
 CONFIG.RegionBehavior.dataModels[ID+'.trigger']=TriggerBehavior;CONFIG.RegionBehavior.typeLabels[ID+'.trigger']='PF2e Area Triggers';CONFIG.RegionBehavior.typeIcons[ID+'.trigger']='fa-solid fa-dice-d20';
});
Hooks.once('ready',()=>{
 for(const event of ['createWall','updateWall','deleteWall','canvasReady','updateScene'])Hooks.on(event,invalidateLocalAuraCaches);
 Hooks.on('refreshToken',token=>repairAuraRadii(token.document));
 Hooks.on('deleteToken',forgetMovement);
 Hooks.on('createToken',()=>{if(gm())enqueue(reconcile);});
 Hooks.on('moveToken',(token,movement)=>{repairAuraRadii(token);if(gm())enqueue(async()=>{const exposures=await syncFollowingRegions(token,movement);for(const exposure of exposures)await trigger(exposure.source,exposure.target,exposure.event,movement.subpathId??movement.id);captureAuraMove(token,movement);await finishAuraMove(token);});});
 game.modules.get(ID).api={scheduleArea:(...args)=>enqueue(()=>scheduleArea(...args)),activateHaunt:(...args)=>enqueue(()=>activateHaunt(...args)),linkArea,setEnvironmentTags,approve:(...args)=>enqueue(()=>approve(...args)),pulse:(...args)=>enqueue(()=>pulse(...args)),setActive,idle,reconcile:()=>enqueue(reconcile),rollSave,damage,setDC,setSourceLive,turn:(c,e,p)=>enqueue(()=>turn(c,e,p)),round:e=>enqueue(()=>round(e))};listenSocket();
 Hooks.on('preUpdateCombat',(e,changes,options)=>{if('turn'in changes||'round'in changes)options[ID]={...(options[ID]??{}),clockBefore:{round:e.round,turn:e.turn,ids:e.turns.map(c=>c.id)}};});
 Hooks.on('updateCombat',(e,changes,options)=>{if(!gm())return;if(changes.round>0)enqueue(()=>round(e));if(options[ID]?.clockBefore)enqueue(()=>advanceScheduled(e,options[ID].clockBefore));});
 Hooks.on('createChatMessage',message=>{if(gm())enqueue(()=>spellCastAreas(message));});
 Hooks.on('pf2e.startTurn',(c,e)=>enqueue(()=>turn(c,e,'start')));Hooks.on('pf2e.endTurn',(c,e)=>enqueue(()=>turn(c,e,'end')));
 Hooks.on('createItem',item=>{if(gm())enqueue(async()=>{await reconcile();await activatedAura(item);});});
 Hooks.on('updateItem',(item,changes)=>{if(gm())enqueue(async()=>{await reconcile();if(changes.flags?.[ID]?.active?.enabled)await activatedAura(item);});});
 Hooks.on('deleteItem',()=>{if(gm())enqueue(reconcile);});
 Hooks.on('createRegion',(r,_o,u)=>{if(gm()){rememberPlacement(r);enqueue(reconcile);}});
 Hooks.on('preUpdateRegion',(r,changes,options)=>{if(enabled()&&changes.shapes&&profiles[binding(r)?.profile]?.sweptArea)options[ID]={previousShapes:foundry.utils.deepClone(r.shapes)};});
 Hooks.on('updateRegion',(r,changes,options)=>{if(changes.shapes&&r.getFlag(ID,'binding'))void r.polygonTree;if(gm()&&changes.shapes&&options[ID]?.previousShapes)enqueue(()=>recordRegionSweep(r,options[ID].previousShapes));if(gm()&&(changes.flags?.[ID])){if(changes.flags?.[ID]?.linkedArea)rememberPlacement(r);enqueue(reconcile);}});
 Hooks.on('deleteRegion',r=>{if(gm())enqueue(()=>ended(r));});
 Hooks.on('updateWorldTime',()=>{if(gm())enqueue(reconcile);});Hooks.on('canvasReady',()=>{if(enabled())for(const token of canvas.scene.tokens)repairAuraRadii(token);if(gm())enqueue(reconcile);});
 Hooks.on('updateUser',()=>{if(gm())enqueue(reconcile);});if(canvas.ready){if(enabled())for(const token of canvas.scene.tokens)repairAuraRadii(token);if(gm())enqueue(reconcile);}
});
