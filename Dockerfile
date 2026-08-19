FROM node:20-slim
CMD ["node","-e","require(\"http\").createServer((q,s)=>{s.end(\"ok\")}).listen(process.env.PORT||3000)"]
