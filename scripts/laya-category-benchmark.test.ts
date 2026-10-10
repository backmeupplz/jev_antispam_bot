import {test,expect} from "bun:test";
import {parseRow} from "./laya-category-benchmark";
import {SPAM_QUESTIONS} from "../src/spam";
const answers=()=>Object.fromEntries(Object.keys(SPAM_QUESTIONS).map(k=>[k,{type:"noul",noul:0.1}]));
const row=(a:any,state:any={message:{text:"safe",embeddedLinks:[],isForwarded:false},recentMessages:[]})=>({id:"safe",arm:"test",state,response:{model:"test",answers:a}});
test("fixed .80 boundary and media decision",async()=>{let a=answers();a.unsolicited_promotion!.noul=.80;expect((await parseRow(row(a))).shouldDelete).toBe(true);expect((await parseRow(row(a,{message:{text:"",mediaOnly:true},recentMessages:[]}))).shouldDelete).toBe(false);a.media_profile_funnel!.noul=.8;expect((await parseRow(row(a,{message:{text:"",mediaOnly:true},recentMessages:[]}))).shouldDelete).toBe(true);});
test("missing and invalid answers fail open",async()=>{let a=answers();delete a.profile_bait;expect((await parseRow(row(a))).failOpen).toBe(true);a=answers();a.profile_bait!.noul=2;expect((await parseRow(row(a))).shouldDelete).toBe(false);});
test("history links only select when current deleted",async()=>{let a:any=answers();a.context_message_0={type:"noul",noul:1};const s={message:{text:"safe"},recentMessages:[{text:"old"}]};expect((await parseRow(row(a,s))).selectedPositions).toEqual([]);a.unsolicited_promotion.noul=1;expect((await parseRow(row(a,s))).selectedPositions).toEqual([1,100]);delete a.context_message_0;expect((await parseRow(row(a,s))).failOpen).toBe(true);});

test("teacher missing is unknown not keep truth",async()=>{const a=answers();delete a.profile_bait;const r=await parseRow({...row(a),arm:"teacher"});expect(r.shouldDelete).toBeNull();expect(r.failOpen).toBe(false);});
test("actual linkage threshold remains .75",async()=>{const a:any=answers();a.unsolicited_promotion.noul=.9;a.context_message_0={type:"noul",noul:.75};const r=await parseRow(row(a,{message:{text:"safe"},recentMessages:[{text:"old"}]}));expect(r.selectedPositions).toEqual([1,100]);});
