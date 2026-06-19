const http=require('http'),fs=require('fs'),path=require('path');
const dir=__dirname;
const srv=http.createServer((req,res)=>{
  let p=req.url.split('?')[0]; if(p==='/')p='/index.html';
  const f=path.join(dir,p);
  fs.readFile(f,(e,d)=>{
    if(e){res.writeHead(404);res.end('nf');return;}
    const ext=path.extname(f);
    const t={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[ext]||'text/plain';
    res.writeHead(200,{'Content-Type':t});res.end(d);
  });
});
let port=parseInt(process.env.PORT,10)||8100;
const maxTry=port+20;
srv.on('error',e=>{
  if(e.code==='EADDRINUSE'&&port<maxTry){console.log('Porta '+port+' occupata, provo la '+(port+1)+'…');port++;srv.listen(port);}
  else{console.error('Impossibile avviare il server: '+e.message);process.exit(1);}
});
srv.on('listening',()=>console.log('Type Tool attivo → http://localhost:'+port));
srv.listen(port);
