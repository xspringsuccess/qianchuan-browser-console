export class CdpClient {
  constructor(url){this.url=url;this.nextId=1;this.pending=new Map();this.listeners=new Map();}
  async connect(){
    this.socket=new WebSocket(this.url);
    await new Promise((resolve,reject)=>{this.socket.addEventListener('open',resolve,{once:true});this.socket.addEventListener('error',reject,{once:true});});
    this.socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(!message.id){for(const listener of this.listeners.get(message.method)||[])listener(message.params);return;}const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);message.error?pending.reject(new Error(message.error.message)):pending.resolve(message.result);});
    this.socket.addEventListener('close',()=>{for(const pending of this.pending.values())pending.reject(new Error('CDP connection closed'));this.pending.clear();});
    return this;
  }
  send(method,params={}){const id=this.nextId++;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params}));});}
  on(method,listener){const listeners=this.listeners.get(method)||[];listeners.push(listener);this.listeners.set(method,listeners);return()=>this.listeners.set(method,listeners.filter(item=>item!==listener));}
  async evaluate(expression){const result=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text||'CDP evaluation failed');return result.result.value;}
  close(){this.socket?.close();}
}
