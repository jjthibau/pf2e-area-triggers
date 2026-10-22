import assert from 'node:assert/strict';
import {test} from 'node:test';
import {profiles} from '../scripts/profiles.js';
import {catalogData} from '../scripts/catalog.js';
import {syncFollowingRegions} from '../scripts/sources.js';
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
