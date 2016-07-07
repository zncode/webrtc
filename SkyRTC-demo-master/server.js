var express = require('express');
var app = express();
var server = require('http').createServer(app);
var SkyRTC = require('skyrtc').listen(server);
var path = require("path");
var request = require("request");

var mysql = require('mysql');
var unserialize = require('locutus/php/var/unserialize');


var url = "http://realusionapi.87vr.com/session_info.php?id=05l5rvjurialsidqv9064tfbq6";
request(
    {
        method: 'GET',
        uri: url,
    },
    function(error, response, body){
    //    console.log('server encoded the data as: ' + (response.headers['content-encoding'] || 'identity'));
    //    console.log('the decoded data is: '+body);
    }
).on('data', function(data){
    console.log('decoded chunk: ' + data);
});
//var connection = mysql.createConnection({
//    host: 'rdsmcaz1q7ij010idl7kpublic.mysql.rds.aliyuncs.com',
//    user: 'realusion',
//    password: 'A1@3785abc9#1',
//    port: '3306',
//});
//
//connection.connect(function(error){
//    if(error)
//    {
//        console.log('[query] - :' + error);
//        return;
//    }
//    console.log('[connection connect] succeed!');
//});
//
//connection.query("select * from vcdata_session.realusion_session where sSessionKey = '05l5rvjurialsidqv9064tfbq6' ", function(err, rows, fields){
//    if(err){
//        console.log('[query] - :' + err)
//    }
//    var sValue = rows[0].sSessionValue;
//    var sValueObj = unserialize(sValue);
//  //      console.log('aa'+sValueObj);
//    //var mIdx = sValueObj.gr_member_idx;
//
//    console.log('The sSessionValue is: ', sValue);
//    //console.log('member idx: : ', mIdx);
//    
//});
//
//connection.end(function(err){
//    if(err)
//    {
//        return;
//    }
//    console.log('[connection end] succeed!');
//});

var port = process.env.PORT || 3000;
server.listen(port);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function(req, res) {
	res.sendfile(__dirname + '/index.html');
});

SkyRTC.rtc.on('new_connect', function(socket) {
	console.log('创建新连接:' + socket.id );
});
SkyRTC.rtc.on('register', function(socket) {
	console.log('新用户userid:' + socket.uid  + " socketid:" + socket.id + " sessionid: " + socket.session_id);
});
SkyRTC.rtc.on('remove_peer', function(socket) {
	console.log("用户" + socket.uid + "用户关闭连接:" + socket.id);
});
SkyRTC.rtc.on('bye', function(socket) {
	console.log("用户离开" + socket.uid );
});

SkyRTC.rtc.on('new_peer', function(socket, room) {
	console.log("新用户" + socket.uid + "加入房间" + room);
});

SkyRTC.rtc.on('socket_message', function(socket, msg) {
	console.log("接收到来自" + socket.uid + "的新消息：" + msg);
});

SkyRTC.rtc.on('ice_candidate', function(socket, ice_candidate) {
	console.log("接收到来自" + socket.uid + "的ICE Candidate" + JSON.stringify(ice_candidate));
});

SkyRTC.rtc.on('offer', function(socket, offer) {
	console.log("接收到来自" + socket.uid + "的Offer" + JSON.stringify(offer) );
});

SkyRTC.rtc.on('answer', function(socket, answer) {
	console.log("接收到来自" + socket.uid + "的Answer:" + JSON.stringify(answer) );
});

SkyRTC.rtc.on('error', function(error) {
	console.log("发生错误：" + error.message);
});
