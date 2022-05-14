import React, { useEffect, useRef, useState } from 'react';
import { Button, Input, Form, message } from 'antd';
import Stream from './stream';
import Video from './video';
import { io } from 'socket.io-client';

const MS = {
  login: 'LOGIN',
  meeting: 'MEETING',
};

const DEFAULT_ICE_SERVER = {
  url: 'turn:47.52.156.68:3478',
  credential: 'zmecust',
  username: 'zmecust',
};

const configuration = {
  iceServers: [DEFAULT_ICE_SERVER],
  sdpSemantics: 'unified-plan',
};

export const WebRTC = () => {
  // wss引用
  const socket = useRef(null);
  const peerMap = useRef({});
  const streamMap = useRef({});
  const roomRef = useRef({
    username: '',
    meetingId: 0,
  });
  const userListRef = useRef([]);
  const localInfoRef = useRef({
    audio: true,
    video: true,
    username: '',
  });

  // 当前用户信息
  const [layoutList, setLayoutList] = useState([]);
  // 当前呼叫状态,login/meeting
  const [meetingStatus, setMeetingStatus] = useState(MS.login);

  useEffect(() => {
    initWSS();
  }, []);

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
          const userList = result.data.users;
          const lastUser = userList[userList.length - 1];
          const { username } = localInfoRef.current;

          // 最后一位是当前用户，则当前用户入会成功
          if (lastUser.username === username) {
            console.log('当前用户加入会议');
            try {
              // 创建本地画面
              await initLocalStream(username);

              // 基于用户列表数据扩展一份数据，增加stream属性
              updateUserList(userList);

              // 基于用户列表数据，处理本地采集视频流、创建P2P通道
              await createPeerConnections(userList);

              // 当前用户加入会议，向所有远端用户peer通道上添加local stream数据
              addStreams();

              // 当前用户加入会议，向所有远端用户发送offer数据，进行ice连接
              sendOffers();

              // 创建LayoutList数据，用来渲染用户信息和画面
              createLayout();
            } catch (err) {
              console.log('加入会议失败，无法采集视频流');
            }
          } else {
            console.log('新用户加入会议');
            // 否则，是远端新用户加入会议，创建Peer通道，等待P2P连接
            createPeer(username);
            const peer = peerMap.current[username];

            addTrack(peer);
          }
          break;
      }
    });
  };

  const updateUserList = (userList) => {
    const nextUserList = userList.map((user) => {
      const { username } = user;
      const stream = streamMap.current[username]?.stream || {};

      return { ...user, stream };
    });

    userListRef.current = nextUserList;
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
    
  };

  /**
   * 向peer通道添加stream track数据
   */
  const addTrack = (peer) => {
    const { username } = localInfoRef.current;
    const localStream = streamMap.current[username].stream.mediaStream;

    console.log('add tracks to peer');

    localStream
      .getTracks()
      .forEach((track) => peer.addTrack(track, localStream));
  };

  const addStreams = () => {
    for (let peer in peerMap.current) {
      addTrack(peer);
    }
  };

  const createPeerConnections = async (userList) => {
    const { username } = roomRef.current;

    for (let i = 0; i < userList.length; i++) {
      const { username: name } = userList[i];

      // 没有创建Peer通道
      if (name !== username) {
        // 新增远端用户，需要初始化PeerConnection
        console.log('is Remote, connection peer...');

        createPeer(username);
      }
    }
  };

  const createPeer = (username) => {
    const peer = (peerMap.current[username] = new RTCPeerConnection(
      configuration
    ));

    peer.onicecandidate = (event) => {
      console.log('ice event: ', event);
    };

    peer.ontrack = (event) => {
      console.log('track event: ', event);
    };

    console.log('创建peer通道成功: ', {
      peer,
      username,
    });
  };

  const initLocalStream = async (username) => {
    const streamInstance = new Stream();

    // 采集音/视频流
    await streamInstance.initStream({
      video: true,
      audio: false,
    });

    streamMap.current[username] = {
      stream: streamInstance.getStream(),
      streamInstance,
    };

    console.log('streamMap.current: ', streamMap.current);
  };

  const createLayout = () => {
    const layouts = [];

    userListRef.current.forEach((user) => {
      const { username } = user;
      const stream = streamMap.current[username]?.stream || {};
      const nextUser = { ...user, stream };

      layouts.push(nextUser);
    });

    console.log('layouts: ', layouts);
    setLayoutList(layouts);
    setMeetingStatus(layouts.length > 0 ? MS.meeting : MS.login);
  };

  // 加入房间
  const onCallMeeting = async (values) => {
    console.log('join room:', values);

    // 缓存入会信息
    roomRef.current = values;
    // 更新Local本地数据
    localInfoRef.current = {
      ...localInfoRef.current,
      username: values.username,
    };

    // 填写完用户名和房间号后，发送消息给信令
    sendMessage({
      type: 'start-call',
      data: values,
    });
  };

  // 发送wss消息
  const sendMessage = (data) => {
    socket.current.send(JSON.stringify(data));
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
      <span className="userTag" key={val.username}>
        <Video item={val} />
      </span>
    ));

    return (
      <div className="layout">
        <div className="users">{layout}</div>
        <div className="operate">
          <Button type="primary">挂断会议</Button>
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
