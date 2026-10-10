// Diagnostic-only, actual production parser/media/history. Never sends network traffic.
import { JevSpamClassifier, CONTEXT_LINK_THRESHOLD } from "../src/spam";
import { deletionMessageIds } from "../src/history";
import { readFileSync, writeFileSync, lstatSync, realpathSync, openSync, closeSync, fstatSync, constants } from "node:fs";
import { resolve, dirname, sep } from "node:path";
export async function parseRow(row: any) {
  const state = row.state;
  const classifier = new JevSpamClassifier("offline", { model: "offline-category", threshold: .80,
    timeoutMs: 1000, url: "http://offline.invalid/v1/systemone", fetch: async () => {
      if (row.failed) return new Response("", {status:500});
      return Response.json(row.response);
    }});
  try {
    const result = await classifier.classify(state.message, state.recentMessages ?? []);
    const recent = (state.recentMessages ?? []).map((m: any, i: number) => ({...m, messageId: i+1, receivedAt:1}));
    const selected = result.shouldDelete ? deletionMessageIds(recent, 100, result.contextProbabilities, CONTEXT_LINK_THRESHOLD) : [];
    return {id:row.id, arm:row.arm, failed:false, failOpen:false, ...result, selectedPositions:selected, linkageThreshold:CONTEXT_LINK_THRESHOLD};
  } catch {
    return {id:row.id, arm:row.arm, failed:true, failOpen:row.arm!=="teacher", shouldDelete:row.arm==="teacher"?null:false, selectedPositions:[]};
  }
}
function privatePath(path: string, exists: boolean) {
 const root="/Users/borodutch/.openclaw/workspace/artifacts/69-category-private";
 const p=resolve(path);if(!p.startsWith(root+sep)||realpathSync(dirname(p))!==dirname(p))throw Error("private path");
 let parent=dirname(p);while(parent.startsWith(root)){const s=lstatSync(parent);if(s.isSymbolicLink()||(s.mode&0o077)!==0||s.uid!==process.getuid!())throw Error("private directory");if(parent===root)break;parent=dirname(parent);}
 if(exists){const s=lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||(s.mode&0o077)!==0||s.uid!==process.getuid!())throw Error("private file");}
 return p;
}
if (import.meta.main) {
 const [input,output]=process.argv.slice(2);const rows=JSON.parse(readFileSync(privatePath(input!,true),"utf8"));
 const seen=new Set();const parsed=[];
 for(const row of rows){const key=row.arm+":"+row.id;if(seen.has(key))throw Error("duplicate matrix row");seen.add(key);parsed.push(await parseRow(row));}
 const out=privatePath(output!,false);const fd=openSync(out,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{const s=fstatSync(fd);if(s.nlink!==1||(s.mode&0o077)!==0)throw Error("private output");writeFileSync(fd,JSON.stringify(parsed));}finally{closeSync(fd);}
}
