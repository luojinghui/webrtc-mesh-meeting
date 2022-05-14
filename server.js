const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: true });

// 房间所有用户信息数据
const roomList = new Map();

io.on('connection', (socket) => {
  socket.on('message', (data) => {
    const message = JSON.parse(data);

    switch (message.type) {
      // 加入房间
      case 'start-call':
        console.log('start-call message:', message);

        const { username, meetingId } = message.data;
        const roomInfo = roomList.get(meetingId);

        // 如果不存在这个房间信息，则创建房间
        if (!roomInfo) {
          roomList.set(meetingId, {});
        }

        // 用户名在房间中已经存在，则禁止加入会议
        if (roomList.get(meetingId)[username]) {
          sendMessage('', {
            type: 'call-state',
            data: {},
            code: 300,
            msg: '该用户名已存在此房间',
          });
        } else {
          // 加入新用户
          const nextRoomUserInfo = roomList.get(meetingId);

          // 设置房间新用户的信息
          nextRoomUserInfo[username] = {
            socket,
            audio: true,
            video: true,
            username,
          };
          roomList.set(meetingId, nextRoomUserInfo);

          // 记录此socket信息，方便断线时更新用户信息
          socket.info = {
            username,
            meetingId,
          };
          socket.join(meetingId);

          const { outboundUsers } = getUsers(meetingId);

          // 推送加入房间状态，并推送给房间中所有的用户数据
          sendMessage(meetingId, {
            type: 'users',
            data: { users: outboundUsers },
            code: 200,
            msg: 'Users',
          });
        }

        break;
    }
  });

  socket.on('disconnect', (e) => {
    console.log('user disconnected', socket.info);

    // 用户下线
    if (socket.info) {
      const { username, meetingId } = socket.info;
      const roomUserInfo = roomList.get(meetingId);

      // 清理房间用户数据
      delete roomUserInfo[username];
      roomList.set(meetingId, roomUserInfo);

      const { users, outboundUsers } = getUsers(meetingId);

      // 没有房间中不存在任何用户，则清理房间
      if (!users.length) {
        roomList.delete(meetingId);
      } else {
        // 推送房间用户信息
        sendMessage(meetingId, {
          type: 'users',
          data: { users: outboundUsers },
          code: 200,
          msg: 'Users',
        });
      }

      console.log('roomList: ', roomList);
    }
  });

  // 发送消息，分为向当前用户发送、向房间内所有用户发送
  const sendMessage = (meetingId, data) => {
    const parseData = JSON.stringify(data);
    const socketInstance = meetingId ? io.to(meetingId) : socket;

    socketInstance.emit('message', parseData);
  };

  // 获取房间内所有用户的信息
  const getUsers = (meetingId) => {
    const roomUser = roomList.get(meetingId) || {};
    const users = Object.keys(roomUser);
    // 过滤当前用户，获取所有远端数据
    const outboundUsers = users.map((user) => {
      const { audio, video, username } = roomUser[user];

      return { audio, video, username };
    });

    return { users, outboundUsers };
  };
});

server.listen(3001, () => {
  console.log('Socket server is running in 3001 port');
});
