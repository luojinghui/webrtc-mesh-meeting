import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button, Input, Form, message } from 'antd';
import { MS, CONFIGURATION } from '../utils';
import { io } from 'socket.io-client';
import Stream from './stream';
import Video from './video';

export const WebRTC = () => {
  // wss引用
  const socket = useRef(null);
  const peerMap = useRef({});
  const streamMap = useRef({});
  const roomRef = useRef({
    username: '',
    meetingId: 0,
  });
  const userListRef = useRef({});
  const localInfoRef = useRef({
    audio: true,
    video: true,
    username: '',
  });
  const meetingStatusRef = useRef(MS.login);
  const isInitLocalStream = useRef(false);
  const msgRef = useRef([]);
  const msgEleRef = useRef(null);

  const [imForm] = Form.useForm();
  // 当前用户信息
  const [layoutList, setLayoutList] = useState([]);
  const [msgList, setMsgList] = useState([]);
  // 当前呼叫状态,login/meeting
  const [meetingStatus, setMeetingStatus] = useState(MS.login);

  const initWSS = () => {
    // 连接信令服务器
    socket.current = io('http://localhost:3001');

    socket.current.on('message', async (msg) => {
      const result = JSON.parse(msg);

      console.log('io receive: ', result);

      switch (result.type) {
        case 'call-state':
          handleCallState(result);

          break;
        case 'users':
          console.log('users message: ', result.data);

          handleUsers(result.data);
          break;

        case 'offer':
          console.log('offer message: ', result.data);

          await handleOffer(result.data);
          break;

        case 'answer':
          console.log('answer message: ', result.data);

          handleAnswer(result.data);
          break;

        case 'candidate':
          console.log('candidate message: ', result.data);

          handleCandidate(result.data);
          break;
      }
    });

    socket.current.on('connect', () => {
      // 填写完用户名和房间号后，发送消息给信令
      sendMessage({
        type: 'start-call',
        data: roomRef.current,
      });
    });
  };

  useEffect(() => {
    meetingStatusRef.current = meetingStatus;
  }, [meetingStatus]);

  useEffect(() => {
    if (msgEleRef.current) {
      msgEleRef.current.scrollTop = msgEleRef.current.scrollHeight;
    }
  }, [msgList]);

  /**
   * 处理用户列表数据
   *
   * 变动来源：当前用户加入会议、远端有人出/入会
   */
  const handleUsers = async (data) => {
    const userList = data.users;
    const userLen = userList.length;
    const lastUser = userList[userLen - 1];
    const { username } = localInfoRef.current;

    updateUserListRef(userList);

    if (lastUser.username === username) {
      // 非第一次加入会议
      if (!isInitLocalStream.current) {
        // 当前用户加入会议
        await localJoinMeeting();
      }
    } else {
      // 远端新用户加入会议
      remoteJoinMeeting(lastUser.username);
    }

    // 创建LayoutList数据，用来渲染用户信息和画面
    createLayout();
    setMeetingStatus(userList.length > 0 ? MS.meeting : MS.login);
  };

  const updateUserListRef = (userList) => {
    console.log('更新userList cache数据');

    const userLen = userList.length;

    for (let i = 0; i < userLen; i++) {
      const item = userList[i];
      const { username: currentUserName } = item;
      const currentUser = userListRef.current[currentUserName];

      if (!currentUser) {
        userListRef.current[currentUserName] = {
          ...item,
          stream: null,
          isDeal: true,
        };
      } else {
        currentUser.isDeal = true;
        userListRef.current[currentUserName] = currentUser;
      }
    }

    for (let username in userListRef.current) {
      const item = userListRef.current[username];

      if (item && !item.isDeal) {
        const { stream, streamInstance } = streamMap.current[username] || {};

        // 清理退会成员stream/peer资源
        if (stream && streamInstance) {
          streamInstance.destroyStream();
        }

        delete streamMap.current[username];
        delete peerMap.current[username];
        delete userListRef.current[username];
      } else {
        const stream = streamMap.current[username]?.stream || {};
        userListRef.current[username] = { ...item, isDeal: false, stream };
      }
    }

    console.log('userListRef.current: ', userListRef.current);
  };

  const remoteJoinMeeting = (username) => {
    console.log('新用户加入会议');
    const { peer } = peerMap.current[username] || {};

    if (!peer) {
      // 否则，是远端新用户加入会议，创建Peer通道，等待P2P连接
      createPeer(username);
      addTrack(peerMap.current[username]);
    }
  };

  const localJoinMeeting = async () => {
    console.log('当前用户加入会议');

    try {
      // 创建本地画面
      await initLocalStream();
      // 基于用户列表数据，处理本地采集视频流、创建P2P通道
      await createPeerConnections();
      // 当前用户加入会议，向所有远端用户peer通道上添加local stream数据
      addStreams();
      // 当前用户加入会议，向所有远端用户发送offer数据，进行ice连接
      sendOffers();

      isInitLocalStream.current = true;
    } catch (err) {
      console.log('加入会议失败，无法采集视频流: ', err);
    }
  };

  const handleCandidate = (msg) => {
    const { candidate, callName } = msg;
    const { peer } = peerMap.current[callName] || {};

    console.log('remote candidate: ', {
      msg,
      peer,
    });

    peer?.addIceCandidate(new RTCIceCandidate(candidate));
  };

  const handleAnswer = (msg) => {
    const { answer, callName } = msg;
    const { peer } = peerMap.current[callName] || {};

    console.log('remote answer: ', {
      msg,
      peer,
    });

    peer?.setRemoteDescription(new RTCSessionDescription(answer));
  };

  const handleOffer = (msg) => {
    const { offer, callName } = msg;
    const { peer } = peerMap.current[callName] || {};

    console.log('handle offer peer: ', {
      peer,
      msg,
    });

    peer?.setRemoteDescription(new RTCSessionDescription(offer));
    // Create an answer to an offer
    peer?.createAnswer(
      (answer) => {
        console.log('created answer sdp: ', answer);

        peer.setLocalDescription(answer);

        sendMessage({
          type: 'answer',
          data: {
            answer,
            connectedName: callName,
          },
        });
      },
      (error) => {
        console.log('creating an answer error: ', error);
      }
    );
  };

  // 呼叫会议状态
  const handleCallState = (result) => {
    const { code, msg } = result;

    // 房间已存在此用户
    if (code === 300) {
      message.info(msg);
    }
  };

  const sendOffers = () => {
    const userList = userListRef.current;
    const { username } = roomRef.current;

    for (let name in userList) {
      if (name !== username) {
        // 新增远端用户，需要初始化PeerConnection
        console.log('is Remote, send offer...');

        sendOffer(name);
      }
    }
  };

  const sendOffer = (name) => {
    const { peer } = peerMap.current[name] || {};

    console.log('send offer: ', {
      peer,
      name,
    });

    const successCallback = (offer) => {
      sendMessage({
        type: 'offer',
        data: {
          offer: offer,
          connectedName: name,
        },
      });
      peer?.setLocalDescription(offer);
    };

    const failureCallback = (err) => {
      console.log('create offer error: ', err);
    };

    peer?.createOffer(successCallback, failureCallback);
  };

  /**
   * 向peer通道添加stream track数据
   */
  const addTrack = (peerInstance) => {
    const { username } = localInfoRef.current;
    const localStream = streamMap.current[username].stream.mediaStream;

    console.log('add tracks to peer: ', peerInstance);

    if (localStream) {
      localStream
        .getTracks()
        .forEach((track) => peerInstance.peer.addTrack(track, localStream));
    }
  };

  const addStreams = () => {
    for (let peer in peerMap.current) {
      addTrack(peerMap.current[peer]);
    }
  };

  const createPeerConnections = async () => {
    const userList = userListRef.current;
    const { username } = roomRef.current;

    for (let name in userList) {
      const { peer } = peerMap.current[name] || {};

      // 没有创建Peer通道
      if (name !== username && !peer) {
        // 新增远端用户，需要初始化PeerConnection
        console.log('is Remote, connection peer...');

        createPeer(name);
      }
    }
  };

  const createPeer = (username) => {
    const peer = new RTCPeerConnection(CONFIGURATION);
    const channal = peer.createDataChannel('sendChannel');

    peerMap.current[username] = { peer, channal };

    channal.onopen = () => {
      console.log('datachannel open');
    };

    channal.onclose = () => {
      console.log('datachannel closed');
    };

    peer.onicecandidate = (event) => {
      console.log('ice event: ', event);

      if (event.candidate) {
        sendMessage({
          type: 'candidate',
          data: {
            candidate: event.candidate,
            connectedName: username,
          },
        });
      }
    };

    peer.onconnectionstatechange = (event) => {
      console.log('peerConnection connect status: ', peer.connectionState);
      console.log('conect peer: ', peer);
    };

    peer.ontrack = (event) => {
      console.log('track event: ', event);

      const mediaStream = event.streams[0];
      const streamInstance = new Stream();

      streamInstance.setStream(mediaStream);

      streamMap.current[username] = {
        stream: streamInstance.getStream(),
        streamInstance,
      };

      createLayout();
    };

    createIMByDatachannel(peer);

    console.log('创建peer通道成功: ', {
      peer,
      username,
    });
  };

  const onIMMessage = (event) => {
    console.log('im message event: ', event);

    const data = JSON.parse(event.data);

    updateMsgList(data);
  };

  const updateMsgList = (data) => {
    msgRef.current.push(data);

    setMsgList(JSON.parse(JSON.stringify(msgRef.current)));
  };

  const createIMByDatachannel = (peer) => {
    peer.ondatachannel = (event) => {
      const receiveChannel = event.channel;

      receiveChannel.onmessage = onIMMessage;
      receiveChannel.onopen = (event) => {
        console.log('im open event: ', event);
      };
      receiveChannel.onclose = (event) => {
        console.log('im close event: ', event);
      };
    };
  };

  const initLocalStream = async () => {
    const { username, video, audio } = localInfoRef.current;
    const localStream = streamMap.current[username];

    if (localStream) {
      return;
    }
    console.log('init local stream: ', username);

    const streamInstance = new Stream();

    // 采集音/视频流
    await streamInstance.initStream({ video, audio });

    streamMap.current[username] = {
      stream: streamInstance.getStream(),
      streamInstance,
    };

    console.log('streamMap.current: ', streamMap.current);
  };

  const createLayout = () => {
    const layouts = [];
    const { username: localName } = localInfoRef.current;

    for (let username in userListRef.current) {
      const user = userListRef.current[username];
      const stream = streamMap.current[username]?.stream || {};
      const streamId = stream ? stream.id : 0;
      const isLocal = localName === username;
      const nextUser = {
        ...user,
        stream,
        id: `${username}_${streamId}`,
        isLocal,
      };

      layouts.push(nextUser);
    }

    console.log('layouts: ', layouts);
    setLayoutList(layouts);
  };

  // 加入房间
  const onCallMeeting = async (values) => {
    console.log('join room:', values);

    const val = {
      ...values,
      video: true,
      audio: false,
    };

    // 缓存入会信息
    roomRef.current = val;
    // 更新Local本地数据
    localInfoRef.current = {
      ...localInfoRef.current,
      ...val,
      username: values.username,
    };

    initWSS();
  };

  // 发送wss消息
  const sendMessage = (msg) => {
    const { data } = msg;
    const { meetingId, username } = roomRef.current;

    // 扩展参数，携带meetingId信息
    msg.data = {
      ...data,
      meetingId,
      callName: username,
    };

    console.log('send message: ', msg);
    socket.current.send(JSON.stringify(msg));
  };

  const onSendMessage = (e) => {
    console.log('finish e: ', e);

    if (e.msg) {
      const { username } = localInfoRef.current;
      const msg = {
        type: 'text',
        msg: e.msg,
        sender: username,
        id: new Date().valueOf(),
      };

      for (let username in peerMap.current) {
        const { channal } = peerMap.current[username];

        updateMsgList(msg);
        channal.send(JSON.stringify(msg));
      }
    }

    imForm.resetFields();
  };

  /**
   * 挂断会议
   */
  const endCall = () => {
    socket.current.disconnect();

    for (let key in streamMap.current) {
      const stream = streamMap.current[key];

      console.log('close stream: ', streamMap.current[key]);

      stream.streamInstance.destroyStream();
    }

    peerMap.current = {};
    streamMap.current = {};
    localInfoRef.current = {};
    msgRef.current = [];
    roomRef.current = {};
    userListRef.current = {};
    isInitLocalStream.current = false;
    setMeetingStatus(MS.login);
    setLayoutList([]);
    setMsgList([]);
  };

  const inRoom = meetingStatus === MS.meeting;

  const renderCall = () => {
    if (inRoom) {
      return null;
    }

    return (
      <div className="call">
        <div className="form">
          <Form
            labelCol={{ span: 8 }}
            wrapperCol={{ span: 16 }}
            onFinish={onCallMeeting}
          >
            <Form.Item
              label="用户名"
              name="username"
              rules={[
                {
                  required: true,
                  message: 'Please input your username!',
                },
              ]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              label="房间号"
              name="meetingId"
              rules={[
                {
                  required: true,
                  message: 'Please input your meetingId!',
                },
              ]}
            >
              <Input />
            </Form.Item>

            <Form.Item wrapperCol={{ offset: 8, span: 16 }}>
              <Button type="primary" htmlType="submit">
                加入会议
              </Button>
            </Form.Item>
          </Form>
        </div>
      </div>
    );
  };

  const renderMeeting = () => {
    if (!inRoom) {
      return null;
    }

    const layout = layoutList.map((val) => (
      <Video item={val} key={val.username} />
    ));

    return (
      <div className="layout">
        <div className="users">
          <div className="video-box">{layout}</div>
          <div className="im-box">
            <div className="message" ref={msgEleRef}>
              <ul>
                {msgList.map((item) => {
                  const isSelf = localInfoRef.current.username === item.sender;

                  return (
                    <li
                      key={item.id}
                      className={isSelf ? 'msg reverse' : 'msg'}
                    >
                      <div className="name">{item.sender}</div>
                      <div>{item.msg}</div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="input">
              <Form layout="inline" form={imForm} onFinish={onSendMessage}>
                <Form.Item name="msg" className="im-input">
                  <Input />
                </Form.Item>

                <Form.Item className="im-btn">
                  <Button type="primary" htmlType="submit">
                    发送
                  </Button>
                </Form.Item>
              </Form>
            </div>
          </div>
        </div>
        <div className="operate">
          <Button type="primary" onClick={endCall}>
            挂断会议
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="content">
      {renderCall()}
      {renderMeeting()}
    </div>
  );
};
