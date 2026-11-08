import assert from 'node:assert/strict';
import {test} from 'node:test';
import {profiles,profileFor} from '../scripts/profiles.js';
import {catalogData} from '../scripts/catalog.js';
import {syncFollowingRegions,encounterSceneId,encounterInScene,startedEncounter} from '../scripts/sources.js';
test('Freezing Rain retains its ten-minute maximum',()=>assert.equal(profiles['freezing-rain'].duration,600));
test('Catalog provenance and registered triggers are consistent',()=>{
 assert.equal(new Set(Object.values(catalogData).map(p=>p.canonical)).size,Object.keys(catalogData).length);
 const events=new Set(['enter','leave','move','teleport','start','end','cast','sustain','source-start','source-end','round','activate','scheduled']);
 for(const[id,p]of Object.entries(profiles)){assert.ok(Array.isArray(p.events),id);for(const e of p.events)assert.ok(events.has(e),id+': '+e);for(const c of p.companions??[])assert.ok(profiles[id+'-'+c.key],id);}
});
test('Following fields remain aligned through flight and legacy movement',async()=>{
 globalThis.game={user:{isActiveGM:true},settings:{get:()=>true}};
 const state={profile:'darklight',follow:{tokenUUID:'Token.caster',x:100,y:200,elevation:0}};
 const region={shapes:[{type:'circle',x:150,y:250,radius:300}],elevation:{bottom:0,top:10},getFlag:()=>state,async update(c){this.shapes=c.shapes;state.follow=c['flags.pf2e-area-triggers.binding.follow'];for(const k of ['bottom','top'])if('elevation.'+k in c)this.elevation[k]=c['elevation.'+k];}};
 const token={uuid:'Token.caster',x:200,y:400,elevation:20,parent:{regions:[region]}};
 await syncFollowingRegions(token);assert.deepEqual(region.elevation,{bottom:20,top:30});assert.deepEqual([region.shapes[0].x,region.shapes[0].y],[250,450]);
 delete state.follow.elevation;token.elevation=30;await syncFollowingRegions(token,{origin:{elevation:20}});assert.deepEqual(region.elevation,{bottom:30,top:40});
 region.elevation={bottom:null,top:null};token.elevation=50;await syncFollowingRegions(token);assert.deepEqual(region.elevation,{bottom:null,top:null});
});


test('unlinked encounter resolves the single authoritative combatant scene',()=>{
 const scene={id:'scene-a'},encounter={active:true,started:true,scene:null,combatants:[{tokenId:'a',sceneId:'scene-a'},{tokenId:'b',sceneId:'scene-a'},{actorId:'actor-only'}]};
 assert.equal(encounterSceneId(encounter),'scene-a');assert.equal(encounterInScene(encounter,scene),true);
 globalThis.game={combats:[encounter]};assert.equal(startedEncounter(scene),encounter);
});
test('explicit scene link wins over combatant inference, including a missing linked document',()=>{
 const combatants=[{tokenId:'a',sceneId:'scene-a'}];assert.equal(encounterSceneId({scene:{id:'scene-b'},combatants}),'scene-b');assert.equal(encounterSceneId({scene:null,_source:{scene:'deleted-scene'},combatants}),'deleted-scene');
 assert.equal(encounterInScene({active:true,started:true,scene:{id:'scene-b'},combatants},{id:'scene-a'}),false);
});
test('empty, actor-only, missing-scene and mixed-scene encounters stay unresolved',()=>{
 for(const combatants of [[],[{actorId:'actor-only'}],[{tokenId:'a'}],[{tokenId:'a',sceneId:'scene-a'},{tokenId:'b'}],[{tokenId:'a',sceneId:'scene-a'},{tokenId:'b',sceneId:'scene-b'}]])assert.equal(encounterSceneId({scene:null,combatants}),null);
});
test('inactive and unstarted encounters never enable exposure or timing',()=>{
 const encounter={active:true,started:true,combatants:[{tokenId:'a',sceneId:'scene-a'}]},scene={id:'scene-a'};
 assert.equal(encounterInScene({...encounter,active:false},scene),false);assert.equal(encounterInScene({...encounter,started:false},scene),false);assert.equal(encounterInScene(encounter,{id:'scene-b'}),false);
});
test('scene fallback is re-evaluated after combatant moves and explicit relinking',()=>{
 const encounter={active:true,started:true,scene:null,combatants:[{tokenId:'a',sceneId:'scene-a'}]};assert.equal(encounterInScene(encounter,{id:'scene-a'}),true);encounter.combatants[0].sceneId='scene-b';assert.equal(encounterInScene(encounter,{id:'scene-a'}),false);assert.equal(encounterInScene(encounter,{id:'scene-b'}),true);encounter.scene={id:'scene-c'};assert.equal(encounterInScene(encounter,{id:'scene-b'}),false);
});


test('reviewed imported aura identities retain native actor/item identity and aura guards',()=>{
 const rows=[['Compendium.pf2e.pathfinder-bestiary-2.Actor.jCF9HjF42SPXTptP','EYtHIPWgwGTdjCBp','fascination-of-flame','catalog-15c0819e1b102fbb'],['Compendium.pf2e.pathfinder-bestiary-2.Actor.qjAtPDIi7OyUGsNy','Ai8J0A4OuhkDr7Cx','confusing-gaze','catalog-ed47cf3da3e0b9f3'],['Compendium.pf2e.pathfinder-bestiary-2.Actor.zXZrUTQSI0WxAsF5','H5H2qTd7RH9FnyiA','enliven-foliage','catalog-1f25bfae57ae80c8'],['Compendium.pf2e.strength-of-thousands-bestiary.Actor.gOiaU4B29galdmu2','AGjtcz0cAWzBXlEx','unluck-aura','reviewed-0e865263913c1918'],['Compendium.pf2e.strength-of-thousands-bestiary.Actor.zgd9SvS7CyWTHlBs','V91wrEHb3gd1ahCH','unluck-aura','reviewed-0e865263913c1918']];
 for(const [source,id,slug,expected] of rows){const item={id,slug,type:'action',actor:{sourceId:source},system:{description:{value:'Native authored description'},rules:[{key:'Aura',slug}]}};assert.equal(profileFor(item)?.id,expected);assert.equal(profileFor({...item,actor:{sourceId:'Actor.unrelated'}}),null);assert.equal(profileFor({...item,id:'changed-item-id'}),null);assert.equal(profileFor({...item,system:{...item.system,rules:[]}}),null);assert.equal(profileFor({...item,system:{...item.system,rules:[{key:'Aura',slug:'unrelated-aura'}]}}),null);}
});
