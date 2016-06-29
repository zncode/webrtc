var SkyRTC = function() {
    //var PeerConnection = (window.PeerConnection || window.webkitPeerConnection00 || window.webkitRTCPeerConnection || window.mozRTCPeerConnection);
    var PeerConnection = (window.PeerConnection || window.webkitPeerConnection00 || window.webkitRTCPeerConnection || window.mozRTCPeerConnection  );
    var URL = (window.URL || window.webkitURL || window.msURL || window.oURL);
    var getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);
    var nativeRTCIceCandidate = (window.mozRTCIceCandidate || window.RTCIceCandidate);
    var nativeRTCSessionDescription = (window.mozRTCSessionDescription || window.RTCSessionDescription); // order is very important: "RTCSessionDescription" defined in Nighly but useless
    var moz = !!navigator.mozGetUserMedia;
    //不添加都可以
 	var iceServer = {
		"iceServers": [{"url": "turn:42.62.24.227:3478", 
		 "credential": "happynetwork",
		 "username": "im"
        }]   
		};
    var packetSize = 1000;
        // "iceServers": [{
            // "url": "stun:stun.l.google.com:19302"
        // }]

		// "iceServers": [{
            // "url": "stun:42.62.24.227:3478"
        // }]
    /**********************************************************/
    /*                                                        */
    /*                       事件处理器                       */
    /*                                                        */
    /**********************************************************/
    function EventEmitter() {
        this.events = {};
    }
    //绑定事件函数
    EventEmitter.prototype.on = function(eventName, callback) {
        this.events[eventName] = this.events[eventName] || [];
        this.events[eventName].push(callback);
    };
    //触发事件函数
    EventEmitter.prototype.emit = function(eventName, _) {
        var events = this.events[eventName],
            args = Array.prototype.slice.call(arguments, 1),
            i, m;

       if (!events) {
            return;
        }
       for (i = 0, m = events.length; i < m; i++) {
  	console.log( "触发事件:" + m + ":" + i + ":" + eventName );
           events[i].apply(null, args);
        }
    };


    /**********************************************************/
    /*                                                        */
    /*                   流及信道建立部分                     */
    /*                                                        */
    /**********************************************************/


    /*******************基础部分*********************/
    function skyrtc() {
        //本地media stream
        this.localMediaStream = null;
        //所在房间
        this.room = "";
        //接收文件时用于暂存接收文件
        this.fileData = {};
        //本地WebSocket连接
        this.socket = null;
        //本地socket的id，由后台服务器创建
        this.me = null;
        //本地userid
        this.userid = null;
        //保存所有与本地相连的peer connection， 键为socket id，值为PeerConnection类型
        this.peerConnections = {};
        //保存所有与本地连接的socket的id
        this.connections = [];
        //初始时需要构建链接的数目
        this.numStreams = 0;
        //初始时已经连接的数目
        this.initializedStreams = 0;
        //保存所有的data channel，键为socket id，值通过PeerConnection实例的createChannel创建
        this.dataChannels = {};
        //保存所有发文件的data channel及其发文件状态
        this.fileChannels = {};
        //保存所有接受到的文件
        this.receiveFiles = {};
    }
    //继承自事件处理器，提供绑定事件和触发事件的功能
    skyrtc.prototype = new EventEmitter();


    /*************************服务器连接部分***************************/


    //本地连接信道，信道为websocket
    skyrtc.prototype.connect = function(server, room) {
        var socket,
        that = this;
        room = room || "chatroom";
        socket = this.socket = new WebSocket(server);
								console.log( "连接地址:" + server + " 房间号:" + room);
		var uid = (new Date().getTime()) ^ Math.random();
	    this.userid = userid = uid.toString();
		this.room = room;
		
        socket.onopen = function() {
            socket.send(JSON.stringify({
                "eventName": "__register",
                "data": {
                    "from": userid
                }
            }));			
           that.emit("socket_opened", socket);
        };

        socket.onmessage = function(message) {
            var json = JSON.parse(message.data);
            if (json.eventName) {
								console.log( "接收到server消息:" + json.eventName + ":" + JSON.stringify( json.data ) );
                that.emit(json.eventName, json.data);
            } else {
								console.log( "接收到server消息onmessage---:" + JSON.stringify( message ) );
                that.emit("socket_receive_message:", socket, json);
            }
        };

        socket.onerror = function(error) {
            that.emit("socket_error", error, socket);
								console.log( "socket.onerror:" + JSON.stringify( error ) );
       };

        socket.onclose = function(data) {
            that.localMediaStream.close();
            var pcs = that.peerConnections;
            for (i = pcs.length; i--;) {
                that.closePeerConnection(pcs[i]);
            }
            that.peerConnections = [];
            that.dataChannels = {};
            that.fileChannels = {};
            that.connections = [];
            that.fileData = {};
 								console.log( "socket.onclose:" + JSON.stringify( data ) );
           that.emit('socket_closed', socket);
        };
		
		//------------------------------接收到server消息--------------------------------------------------
         //注册消息返回
		 this.on('__register', function(data) {
            that.me = data.you;
			that.createStream({
			  "video": true,
			  "audio": true,
			  "active": false
			});
			
            that.emit('register_finish', socket);
       });
        
        //取得联系人消息返回
		this.on('__get_contacts', function(data) {
            that.contacts = data.users;
			
            that.emit('get_contacts', socket);
        });
        //邀请信息返回
		this.on('__invite', function(data) {
			that.room = data.room;
 								console.log( "__invite回复  取得房间号:" + that.room );

            that.emit('get_roomid', data);
	   });
	   
        //收到邀请信息
		this.on('_invite', function(data) {
			//加入此房间发送__join
			that.joinRoom( data.room );
  								console.log( "收到邀请信息，加入聊天室:" + data.room );
		});

        //房间里所有的连接信息
		this.on('_peers', function(data) {
            that.connections = data.connections;
							console.log( "成功创建WebSocket连接: rtc.createStream begin(创建本地视频流)" );
			that.createStream({
			  "video": true,
			  "audio": true,
			  "active": true
			});
       });

        this.on("_ice_candidate", function(data) {
            var candidate = new nativeRTCIceCandidate(data);
            var pc = that.peerConnections[data.from];
            var ret = pc.addIceCandidate(candidate);
			
           that.emit('get_ice_candidate', candidate);
        });

        this.on('_new_peer', function(data) {
            // that.connections.push(data.from);
            // that.createPeerConnection(data.from);
			
            // var pc = that.peerConnections[data.from];
			// pc.addStream(that.localMediaStream)
            that.emit('new_peer', data.from);
		});

        this.on('_remove_peer', function(data) {
            var sendId;
            that.closePeerConnection(that.peerConnections[data.from]);
            delete that.peerConnections[data.from];
            delete that.dataChannels[data.from];
            for (sendId in that.fileChannels[data.from]) {
                that.emit("send_file_error", new Error("Connection has been closed"), data.from, sendId, that.fileChannels[data.from][sendId].file);
            }
            delete that.fileChannels[data.from];
								console.log( "_remove_peer用户关闭连接:" + JSON.stringify( data ) );
           that.emit("remove_peer", data.from);
		});
        this.on('_bye_peer', function(data) {
								console.log( "_bye_peer用户退出聊天室:" + JSON.stringify( data ) );
           that.emit("_remove_peer", data);
		});

        this.on('_offer', function(data) {
            that.receiveOffer(data.from, data.sdp);
            that.emit("get_offer", data);
		});

        this.on('_answer', function(data) {
            that.receiveAnswer(data.from, data.sdp);
            that.emit('get_answer', data);
		});
        
		this.on('_msg', function(data) {
            that.emit('get_msg', data);
        });

        this.on('send_file_error', function(error, socketId, sendId, file) {
            that.cleanSendFile(sendId, socketId);
        });

        this.on('receive_file_error', function(error, sendId) {
            that.cleanReceiveFile(sendId);
        });
		//给房间里所有人发请求
        this.on('ready', function() {
            that.createAllPeerConnections();
            that.addStreams();
            that.addDataChannels();
								console.log( "准备创建发送offer----this.on:ready");
            that.sendOffers();
        });
    };


    /*************************流处理部分*******************************/


    //创建媒体流
    skyrtc.prototype.createStream = function(options) {
        var that = this;

        options.video = !!options.video;
        options.audio = !!options.audio;

        if (getUserMedia) {
            this.numStreams++;
			
            getUserMedia.call( 
				navigator, 
				options, 
				function(stream) {
					that.localMediaStream = stream;
									console.log( "创建本地流成功" );
					that.initializedStreams++;
					that.emit("stream_created", stream);
					
					if (that.initializedStreams === that.numStreams) {
									console.log( "本地流 ready:" + JSON.stringify( options )  );
						if(options.active) {
							that.emit("ready");							
						}else {
							
						}
					}
				}, 
				function(error) {
					that.emit("stream_create_error", error);
				} );
									console.log( "创建本地流 skyrtc.prototype.createStream:end!" );
       } else {
            that.emit("stream_create_error", new Error('WebRTC is not yet supported in this browser.'));
        }
    };

    //将本地流添加到所有的PeerConnection实例中
    skyrtc.prototype.addStreams = function() {
        var i, m,
            stream,
            userid;
        for (userid in this.peerConnections) {
            this.peerConnections[userid].addStream(this.localMediaStream);
									console.log( "将本地流添加到所有的PeerConnection实例中addStreams:" + userid );
       }
    };

    //将流绑定到video标签上用于输出
    skyrtc.prototype.attachStream = function(stream, domId) {
        var element = document.getElementById(domId);
        if (navigator.mozGetUserMedia) {
            element.mozSrcObject = stream;
            element.play();
									console.log( "将流绑定到video标签上用于输出:play" + stream );
       } else {
            element.src = URL.createObjectURL(stream);
									console.log( "将流绑定到video标签上用于输出createObjectURL" );
        }
        element.src = URL.createObjectURL(stream);
    };


    /***********************信令交换部分******************************************************************/


    //向所有PeerConnection发送Offer类型信令
    skyrtc.prototype.sendOffers = function() {
        var i, m,
            pc,
            that = this,
            pcCreateOfferCbGen = function(pc, userid) {
				
                return function(session_desc) {					
                    pc.setLocalDescription(session_desc);
                    that.socket.send(JSON.stringify({
                        "eventName": "__offer",
                         "data": {
                            "sdp": session_desc,
                            "to": userid
                        }
                    }));					
								console.log( "向所有PeerConnection发送Offer类型信令----:"+ JSON.stringify({
									"eventName": "__offer",
									 "data": {
										"sdp": session_desc,
										"to": userid
									} }) );
					
					
                };
            },
            pcCreateOfferErrorCb = function(error) {
                console.log(error);
            };
			
        for (i = 0, m = this.connections.length; i < m; i++) {
            pc = this.peerConnections[this.connections[i]];
            pc.createOffer(pcCreateOfferCbGen(pc, this.connections[i]), pcCreateOfferErrorCb);
								console.log( "向所有PeerConnection发送Offer类型信令:" + m + ":" + i );
       }
    };

    //接收到Offer类型信令后作为回应返回answer类型信令
    skyrtc.prototype.receiveOffer = function(userid, sdp) {
        this.connections.push(userid);
        this.createPeerConnection(userid);
			
        var pc = this.peerConnections[userid];
		pc.addStream(this.localMediaStream)
        //var pc = this.peerConnections[userid];
        this.sendAnswer(userid, sdp);
   };

    //发送answer类型信令
    skyrtc.prototype.sendAnswer = function(userid, sdp) {
        var pc = this.peerConnections[userid];
        var that = this;
        pc.setRemoteDescription(new nativeRTCSessionDescription(sdp));
        pc.createAnswer(function(session_desc) {
            pc.setLocalDescription(session_desc);
            that.socket.send(JSON.stringify({
                "eventName": "__answer",
                "data": {
                    "to": userid,
                    "sdp": session_desc
                }
            }));
 
		 					console.log( "发送answer类型信令:" + JSON.stringify({
								"eventName": "__answer",
								"data": {
									"to": userid,
									"sdp": session_desc
								}})
							);

		}, function(error) {
            console.log(error);
        });
		
		
    };

    //接收到answer类型信令后将对方的session描述写入PeerConnection中
    skyrtc.prototype.receiveAnswer = function(userid, sdp) {
        var pc = this.peerConnections[userid];
        pc.setRemoteDescription(new nativeRTCSessionDescription(sdp));
    };


    /***********************点对点连接部分************************************************************/


    //创建与其他用户连接的PeerConnections
    skyrtc.prototype.createAllPeerConnections = function() {
        var i, m;
        for (i = 0, m = this.connections.length; i < m; i++) {
 	 				console.log( "创建与其他用户连接的PeerConnections." + m + ":" + i + ":" + this.connections[i] );
           this.createPeerConnection(this.connections[i]);
       }
    };

    //创建单个PeerConnection
    skyrtc.prototype.createPeerConnection = function(userid) {
        var that = this;
		var mediaConstraints = { optional:[{RtpDataChannels:true}]};

		var pc = new PeerConnection(iceServer);
        this.peerConnections[userid] = pc;
						console.log( "创建该用户PeerConnection:" + userid );
        pc.onicecandidate = function(evt) {
            if (evt.candidate) {
                that.socket.send(JSON.stringify({
                    "eventName": "__ice_candidate",
                    "data": {
                        "label": evt.candidate.sdpMLineIndex,
                        "candidate": evt.candidate.candidate,
                        "id": "audio",
                        "to": userid
                   }
				}));
						console.log( "发送candidate消息." + JSON.stringify({
							"eventName": "__ice_candidate",
							"data": {
								"label": evt.candidate.sdpMLineIndex,
								"candidate": evt.candidate.candidate,
								"id": "audio",
								"to": userid
							}
						}) );				
			}
           that.emit("pc_get_ice_candidate", evt.candidate, userid, pc);
        };

        pc.onopen = function() {
 	 				console.log( "--------创建单个PeerConnection pc.onopen." );
           that.emit("pc_opened", userid, pc);
        };

        pc.onaddstream = function(evt) {
  	 				console.log( "-------创建单个PeerConnection pc.onaddstream." );
           that.emit('pc_add_stream', evt.stream, userid, pc);
        };

        pc.ondatachannel = function(evt) {
   	 				console.log( "--------创建单个PeerConnection pc.ondatachannel." );
            that.addDataChannel(userid, evt.channel);
            that.emit('pc_add_data_channel', evt.channel, userid, pc);
        };
        return pc;
    };

    //关闭PeerConnection连接
    skyrtc.prototype.closePeerConnection = function(pc) {
        if (!pc) return;
    	 				console.log( "--------关闭PeerConnection连接." );
       pc.close();
    };


    /***********************数据通道连接部分*****************************/

    //获取在线用户列表
    skyrtc.prototype.getContacts = function() {
		this.socket.send(JSON.stringify({
			"eventName": "__get_contacts",
			 "data": {
				"from": this.userid
			}
		}));	
   	 				console.log( "发送 获取联系人列表 消息__get_contacts" );

	}
	
    //发送邀请信息  
	skyrtc.prototype.sendInviteMsg = function( users ) {
		this.socket.send(JSON.stringify({
			"eventName": "__invite",
			 "data": {
				"room": this.room,
				"type": "video",
				"to": users
			}
		}));
   	 				console.log( "发送邀请信息:" + users );
	}
     //加入房间  
	skyrtc.prototype.joinRoom = function( room ) {
		this.socket.send(JSON.stringify({
			"eventName": "__join",
			 "data": {
				"room": room,
			}
		}));
   	 				console.log( "__join加入房间:" + room );
	}
     //退出房间  
	skyrtc.prototype.byeRoom = function() {
		this.socket.send(JSON.stringify({
			"eventName": "__bye",
			 "data": {
				"room": this.room,
				"action":"active"
			}
		}));
		that = this;
		that.localMediaStream = "";
		var pcs = that.peerConnections;
		for (i = pcs.length; i--;) {
			that.closePeerConnection(pcs[i]);
		}
		that.peerConnections = [];
		that.dataChannels = {};
		that.fileChannels = {};
		that.connections = [];
		that.fileData = {};
							console.log( "用户正常主动/被动退出_bye_peer" );
		
  	 	console.log( "退出房间__bye:" + this.room );
	}

    //消息广播
    skyrtc.prototype.broadcast = function(message) {
        var userid;
		
        for (userid in this.dataChannels) {
            //this.sendMessage(message, userid);
             this.sendP2SMessage(message, userid);
       }
    };
    //发送消息方法p2s
    skyrtc.prototype.sendP2SMessage = function(message, userid) {
		this.socket.send(JSON.stringify({
			"eventName": "__msg",
			 "data": {
				"message": message,
				"from": this.userid,
				"to": userid
			}
		}));	
   	 				console.log( "p2s发送消息:" + message );
	}

    //发送消息方法p2p
    skyrtc.prototype.sendMessage = function(message, userid) {
        if (this.dataChannels[userid].readyState.toLowerCase() === 'open') {
            this.dataChannels[userid].send(JSON.stringify({
                type: "__msg",
                data: message
            }));
   	 				console.log( "发送消息__msg:" + message );
       }
    };

    //对所有的PeerConnections创建Data channel
    skyrtc.prototype.addDataChannels = function() {
        var connection;
        for (connection in this.peerConnections) {
            this.createDataChannel(connection);
        }
    };

    //对某一个PeerConnection创建Data channel
    skyrtc.prototype.createDataChannel = function(userid, label) {
        var pc, key, channel;
        pc = this.peerConnections[userid];

        if (!userid) {
            this.emit("data_channel_create_error", userid, new Error("attempt to create data channel without socket id"));
        }

        if (!(pc instanceof PeerConnection)) {
            this.emit("data_channel_create_error", userid, new Error("attempt to create data channel without peerConnection"));
        }
        try {
            channel = pc.createDataChannel(label);
        } catch (error) {
            this.emit("data_channel_create_error", userid, error);
        }

        return this.addDataChannel(userid, channel);
    };

    //为Data channel绑定相应的事件回调函数
    skyrtc.prototype.addDataChannel = function(userid, channel) {
        var that = this;
        channel.onopen = function() {
            that.emit('data_channel_opened', channel, userid);
        };

        channel.onclose = function(event) {
            delete that.dataChannels[userid];
            that.emit('data_channel_closed', channel, userid);
        };

        channel.onmessage = function(message) {
            var json;
            json = JSON.parse(message.data);
            if (json.type === '__file') {
                /*that.receiveFileChunk(json);*/
                that.parseFilePacket(json, userid);
            } else {
               that.emit('data_channel_message', channel, userid, json.data);
            }
        };

        channel.onerror = function(err) {
            that.emit('data_channel_error', channel, userid, err);
        };

        this.dataChannels[userid] = channel;
        return channel;
    };



    /**********************************************************/
    /*                                                        */
    /*                       文件传输                         */
    /*                                                        */
    /**********************************************************/

    /************************公有部分************************/

    //解析Data channel上的文件类型包,来确定信令类型
    skyrtc.prototype.parseFilePacket = function(json, userid) {
        var signal = json.signal,
            that = this;
        if (signal === 'ask') {
            that.receiveFileAsk(json.sendId, json.name, json.size, userid);
        } else if (signal === 'accept') {
            that.receiveFileAccept(json.sendId, userid);
        } else if (signal === 'refuse') {
            that.receiveFileRefuse(json.sendId, userid);
        } else if (signal === 'chunk') {
            that.receiveFileChunk(json.data, json.sendId, userid, json.last, json.percent);
        } else if (signal === 'close') {
            //TODO
        }
    };

    /***********************发送者部分***********************/


    //通过Dtata channel向房间内所有其他用户广播文件
    skyrtc.prototype.shareFile = function(dom) {
        var userid,
            that = this;
        for (userid in that.dataChannels) {
            that.sendFile(dom, userid);
        }
    };

    //向某一单个用户发送文件
    skyrtc.prototype.sendFile = function(dom, userid) {
        var that = this,
            file,
            reader,
            fileToSend,
            sendId;
        if (typeof dom === 'string') {
            dom = document.getElementById(dom);
        }
        if (!dom) {
            that.emit("send_file_error", new Error("Can not find dom while sending file"), userid);
            return;
        }
        if (!dom.files || !dom.files[0]) {
            that.emit("send_file_error", new Error("No file need to be sended"), userid);
            return;
        }
        file = dom.files[0];
        that.fileChannels[userid] = that.fileChannels[userid] || {};
        sendId = that.getRandomString();
        fileToSend = {
            file: file,
            state: "ask"
        };
        that.fileChannels[userid][sendId] = fileToSend;
        that.sendAsk(userid, sendId, fileToSend);
        that.emit("send_file", sendId, userid, file);
    };

    //发送多个文件的碎片
    skyrtc.prototype.sendFileChunks = function() {
        var userid,
            sendId,
            that = this,
            nextTick = false;
        for (userid in that.fileChannels) {
            for (sendId in that.fileChannels[userid]) {
                if (that.fileChannels[userid][sendId].state === "send") {
                    nextTick = true;
                    that.sendFileChunk(userid, sendId);
                }
            }
        }
        if (nextTick) {
            setTimeout(function() {
                that.sendFileChunks();
            }, 10);
        }
    };

    //发送某个文件的碎片
    skyrtc.prototype.sendFileChunk = function(userid, sendId) {
        var that = this,
            fileToSend = that.fileChannels[userid][sendId],
            packet = {
                type: "__file",
                signal: "chunk",
                sendId: sendId
            },
            channel;

        fileToSend.sendedPackets++;
        fileToSend.packetsToSend--;


        if (fileToSend.fileData.length > packetSize) {
            packet.last = false;
            packet.data = fileToSend.fileData.slice(0, packetSize);
            packet.percent = fileToSend.sendedPackets / fileToSend.allPackets * 100;
            that.emit("send_file_chunk", sendId, userid, fileToSend.sendedPackets / fileToSend.allPackets * 100, fileToSend.file);
        } else {
            packet.data = fileToSend.fileData;
            packet.last = true;
            fileToSend.state = "end";
            that.emit("sended_file", sendId, userid, fileToSend.file);
            that.cleanSendFile(sendId, userid);
        }

        channel = that.dataChannels[userid];

        if (!channel) {
            that.emit("send_file_error", new Error("Channel has been destoried"), userid, sendId, fileToSend.file);
            return;
        }
        channel.send(JSON.stringify(packet));
        fileToSend.fileData = fileToSend.fileData.slice(packet.data.length);
    };

    //发送文件请求后若对方同意接受,开始传输
    skyrtc.prototype.receiveFileAccept = function(sendId, userid) {
        var that = this,
            fileToSend,
            reader,
            initSending = function(event, text) {
                fileToSend.state = "send";
                fileToSend.fileData = event.target.result;
                fileToSend.sendedPackets = 0;
                fileToSend.packetsToSend = fileToSend.allPackets = parseInt(fileToSend.fileData.length / packetSize, 10);
                that.sendFileChunks();
            };
        fileToSend = that.fileChannels[userid][sendId];
        reader = new window.FileReader(fileToSend.file);
        reader.readAsDataURL(fileToSend.file);
        reader.onload = initSending;
        that.emit("send_file_accepted", sendId, userid, that.fileChannels[userid][sendId].file);
    };

    //发送文件请求后若对方拒绝接受,清除掉本地的文件信息
    skyrtc.prototype.receiveFileRefuse = function(sendId, userid) {
        var that = this;
        that.fileChannels[userid][sendId].state = "refused";
        that.emit("send_file_refused", sendId, userid, that.fileChannels[userid][sendId].file);
        that.cleanSendFile(sendId, userid);
    };

    //清除发送文件缓存
    skyrtc.prototype.cleanSendFile = function(sendId, userid) {
        var that = this;
        delete that.fileChannels[userid][sendId];
    };

    //发送文件请求
    skyrtc.prototype.sendAsk = function(userid, sendId, fileToSend) {
        var that = this,
            channel = that.dataChannels[userid],
            packet;
        if (!channel) {
            that.emit("send_file_error", new Error("Channel has been closed"), userid, sendId, fileToSend.file);
        }
        packet = {
            name: fileToSend.file.name,
            size: fileToSend.file.size,
            sendId: sendId,
            type: "__file",
            signal: "ask"
        };
        channel.send(JSON.stringify(packet));
    };

    //获得随机字符串来生成文件发送ID
    skyrtc.prototype.getRandomString = function() {
        return (Math.random() * new Date().getTime()).toString(36).toUpperCase().replace(/\./g, '-');
    };

    /***********************接收者部分***********************/


    //接收到文件碎片
    skyrtc.prototype.receiveFileChunk = function(data, sendId, userid, last, percent) {
        var that = this,
            fileInfo = that.receiveFiles[sendId];
        if (!fileInfo.data) {
            fileInfo.state = "receive";
            fileInfo.data = "";
        }
        fileInfo.data = fileInfo.data || "";
        fileInfo.data += data;
        if (last) {
            fileInfo.state = "end";
            that.getTransferedFile(sendId);
        } else {
            that.emit("receive_file_chunk", sendId, userid, fileInfo.name, percent);
        }
    };

    //接收到所有文件碎片后将其组合成一个完整的文件并自动下载
    skyrtc.prototype.getTransferedFile = function(sendId) {
        var that = this,
            fileInfo = that.receiveFiles[sendId],
            hyperlink = document.createElement("a"),
            mouseEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            });
        hyperlink.href = fileInfo.data;
        hyperlink.target = '_blank';
        hyperlink.download = fileInfo.name || dataURL;

        hyperlink.dispatchEvent(mouseEvent);
        (window.URL || window.webkitURL).revokeObjectURL(hyperlink.href);
        that.emit("receive_file", sendId, fileInfo.userid, fileInfo.name);
        that.cleanReceiveFile(sendId);
    };

    //接收到发送文件请求后记录文件信息
    skyrtc.prototype.receiveFileAsk = function(sendId, fileName, fileSize, userid) {
        var that = this;
        that.receiveFiles[sendId] = {
            socketId: userid,
            state: "ask",
            name: fileName,
            size: fileSize
        };
        that.emit("receive_file_ask", sendId, userid, fileName, fileSize);
    };

    //发送同意接收文件信令
    skyrtc.prototype.sendFileAccept = function(sendId) {
        var that = this,
            fileInfo = that.receiveFiles[sendId],
            //channel = that.dataChannels[fileInfo.userid],
            channel = that.dataChannels[fileInfo.socketId],
            packet;
        if (!channel) {
            that.emit("receive_file_error", new Error("Channel has been destoried"), sendId, userid);
        }
        packet = {
            type: "__file",
            signal: "accept",
            sendId: sendId
        };
        channel.send(JSON.stringify(packet));
    };

    //发送拒绝接受文件信令
    skyrtc.prototype.sendFileRefuse = function(sendId) {
        var that = this,
            fileInfo = that.receiveFiles[sendId],
            channel = that.dataChannels[fileInfo.socketId],
            packet;
        if (!channel) {
            that.emit("receive_file_error", new Error("Channel has been destoried"), sendId, userid);
        }
        packet = {
            type: "__file",
            signal: "refuse",
            sendId: sendId
        };
        channel.send(JSON.stringify(packet));
        that.cleanReceiveFile(sendId);
    };

    //清除接受文件缓存
    skyrtc.prototype.cleanReceiveFile = function(sendId) {
        var that = this;
        delete that.receiveFiles[sendId];
    };

    return new skyrtc();
};
