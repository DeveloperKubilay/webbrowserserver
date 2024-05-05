run();
async function run() {
  var settings = require("./settings.json");
  const express = require("express");
  const http = require("http");
  const socketIo = require("socket.io");
  const puppeteer = require("puppeteer")
  const fs = require("fs")
  const path = require("path")
  var app = express();
  const server = http.createServer(app);
  const io = socketIo(server, {
    maxHttpBufferSize: 4 * 1024 * 1024,
  });
  var tapopenned = 0
  var pagedata = []
  app.get("/", function (req, res) {
    res.sendFile(path.join(__dirname,"./website.html"));
  });
  if (!fs.existsSync("./downloads")) fs.mkdirSync("./downloads");

  browser = await puppeteer.launch({
    args: settings.args || [
      "--no-sandbox",
      "--disable-notifications",
      "--disable-dev-shm-usage",
    ],
    headless: settings.headless == false ? false : "new",
    executablePath: settings.expath || "",
  });

  setInterval(()=>{
    pagedata.map(async (x) => {
      var favicon = ""
     try{favicon = await x.page.$$('link[rel="icon"], link[rel="shortcut icon"]');
      if (favicon.length) {
        favicon = "<img src='"+await favicon[0].evaluate(link => link.href)+"' style='max-height: 25px; max-width: 25px;'>    ";
      } else {favicon = "";}}catch{}
      io.emit("message",{
        newtab:true,
        id: x.id,
        title: await x.page.title(),
        favicon: favicon
      });
    })
  },500)

  io.on("connection", (socket) => {
    if (socket.handshake.auth.auth != settings.password)
      return socket.disconnect();
    io.emit("message",{data:true,array:[]})
    socket.on("server", async (data) => {
      if(data.newtab){
        page = await browser.newPage();
        await page.setUserAgent(settings.useragent || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.101 Safari/537.36')
        await page.setViewport({ width: data.wH.w, height:data.wH.h });
        const client = await page.target().createCDPSession()
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: path.resolve(__dirname, 'downloads'),
            eventsEnabled: true
       });
       var downloading = []
       setInterval(()=>{
           fs.readdirSync("downloads").forEach(file => {
               if(file.endsWith(".crdownload") && !downloading.includes(file)){
                   downloading.push(file.replace(".crdownload",""))
               }
               if(downloading.includes(file)){
                   downloading = downloading.filter(x=>x!=file)
                   io.emit("message",{downloaded:file})
               }
           });
       },1000)
    
        if (fs.existsSync("cookies.json")) {
          for (const cookie of JSON.parse(fs.readFileSync("cookies.json"))) {
          try{  await page.setCookie(cookie);}catch{}
          }
        }
        await page.goto("https://www.google.com/");
        tapopenned++;
        pagedata.push({
          id:tapopenned,
          page:page
        })
      }
      if(data.stream){
        var tempdata = pagedata.filter(z=>z.id == data.stream)
        if(tempdata.length) {try{
          const screenshotBuffer = await tempdata[0].page.screenshot();
          const screenshotBase64 = screenshotBuffer.toString('base64');
          io.emit("message",{
            data:screenshotBase64,
            url: tempdata[0].page.url(),
            time:Date.now()
          })}catch{}
        }
      }
      if(data.close){
        var tempdata = pagedata.filter(z=>z.id == data.close)
        if(tempdata.length) tempdata[0].page.close()
        pagedata = pagedata.filter(z=>z.id != data.close)
      }
      if(data.fxm) pagedata.map(async (x)=>await x.page.setViewport({ width: data.fxm.w, height:data.fxm.h }))
      if(data.control){
        var page = pagedata.filter(z=>z.id == data.control)
        if(page.length) { page = page[0].page
        if(data.mousemove) {try{await page.mouse.move(data.mousemove[0],data.mousemove[1]);}catch{}}
        else if(data.keydown){try{ await page.keyboard.down(data.keydown);}catch{} }
        else if(data.keyup) {try{await page.keyboard.up(data.keyup);}catch{}}
        else if(data.mousedown) {try{await page.mouse.down({ button: data.mousedown });}catch{}}
        else if(data.mouseup) {try{await page.mouse.up({ button: data.mousedown });}catch{}}
        else if(data.mousescrool){try{ await page.mouse.wheel({ deltaY: data.mousescrool });}catch{}}
       }
      }
      if(data.navbar){
        var tempdata = pagedata.filter(z=>z.id == data.tab)
        if(tempdata.length){
          if(data.navbar == "back"){try{await tempdata[0].page.goBack();}catch{}}
          if(data.navbar == "reload"){try{await tempdata[0].page.reload();}catch{}}
          if(data.navbar == "forward"){try{await tempdata[0].page.goForward();}catch{}}
          if(data.navbar == "savecookie"){
            try{const cookies = await page.cookies();
            fs.writeFileSync('cookies.json', JSON.stringify(cookies, null, 2));}catch{}
          }
          if(data.navbar == "setcookie"){ fs.writeFileSync('cookies.json', data.prt2);}
          if(data.navbar == "upload"){
            try{
              const filechooser = await tempdata[0].page.waitForFileChooser()
              await filechooser.accept([path.join(__dirname,"./downloads/"+data.prt2)]);
            }catch{}
          }
          if(data.navbar == "cleardownload"){
            fs.readdirSync("./downloads").map((x)=>{
              fs.unlinkSync("./downloads/"+x)
            })
          }
        } 
      }
      if(data.openurl){
        var tempdata = pagedata.filter(z=>z.id == data.tab)
        if(!data.openurl.includes("http") && !data.openurl.includes("https")) data.openurl = "https://www.google.com/search?q="+data.openurl
        if(tempdata.length){ try{ await tempdata[0].page.goto(data.openurl)}catch{}}
      }
    });
  });
  server.listen(3000);
  console.log("Running");
}
