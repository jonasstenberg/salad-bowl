const bodyParser = require('body-parser')
const cors = require('cors')
const express = require('express')
const http = require('http')
const HttpStatus = require('http-status-codes')
const morgan = require('morgan')
const WebSocket = require('ws')

const app = express()

const server = http.createServer(app)
const wss = new WebSocket.Server({ server, path: '/ws' })

const isProduction = process.env.NODE_ENV === 'production'
const logFormat = isProduction ? 'tiny' : 'dev'

app.use(cors())
app.use(bodyParser.json())
app.use(morgan(logFormat))

const state = require('./state')

wss.on('connection', function connection (ws, req) {
  ws.isAlive = true

  const playerId = req.headers['sec-websocket-key']

  state.players[playerId] = ws

  console.log('New user connected:', playerId)

  ws.send(JSON.stringify({
    playerId
  }))

  ws.on('pong', () => {
    ws.isAlive = true
  })

  ws.on('message', function incoming (message) {
    const data = JSON.parse(message)
    console.log('recieved data', data)
  })

  ws.on('close', function () {
    delete state.players[playerId]
    state.rooms = state.rooms.map(room => {
      if (room.players[playerId]) {
        delete room.players[playerId]
      }

      room.team1 = room.team1.filter(t => t !== playerId)
      room.team2 = room.team2.filter(t => t !== playerId)

      Object.keys(room.players).forEach(p => {
        if (state.players && state.players[p]) {
          state.players[p].send(JSON.stringify(room))
        }
      })

      return room
    }).filter(room => Object.keys(room.players).length)
    console.log(`Deleted user: ${playerId}`)
  })
})

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      console.log('terminated connection to client')
      return ws.terminate()
    }

    ws.isAlive = false
    ws.ping(null, false, true)
  })
}, 5000)

app.post('/api/rooms', (req, res) => {
  const { playerId } = req.body

  try {
    if (!playerId) {
      res.sendStatus(HttpStatus.NOT_FOUND)
      return
    }

    const r = Math.random().toString(36)
    const roomId = r.substring(r.length - 4).replace(/0/g, 'o').toUpperCase()

    const room = {
      roomId,
      ownerId: playerId,
      players: {
        [playerId]: {
          name: '',
          score: 0
        }
      },
      team1: [playerId],
      team2: []
    }

    state.rooms.push(room)
    res.status(HttpStatus.OK).json(room)
  } catch (err) {
    console.log(err)
    res.status(HttpStatus.NOT_FOUND).send(err)
  }
})

app.post('/api/rooms/join', (req, res) => {
  const { playerId, roomId } = req.body

  try {
    if (!playerId) {
      res.sendStatus(HttpStatus.NOT_FOUND)
      return
    }

    const room = state.rooms.find(r => r.roomId === roomId)
    if (!room) {
      console.log('no room found with that id')
      res.sendStatus(HttpStatus.NOT_FOUND)
      return
    }

    room.players[playerId] = {
      name: '',
      score: 0
    }
    if (room.team1.length > room.team2.length) {
      room.team2.push(playerId)
    } else {
      room.team1.push(playerId)
    }

    res.status(HttpStatus.OK).json(room)
  } catch (err) {
    console.log(err)
    res.status(HttpStatus.NOT_FOUND).send(err)
  }
})

app.put('/api/player', (req, res) => {
  const { playerId, name, notes, roomId, salladbowl } = req.body

  try {
    const room = state.rooms.find(r => r.roomId === roomId)

    if (!room) {
      console.log('no room found with that id')
      res.sendStatus(HttpStatus.NOT_FOUND)
      return
    }

    room.salladbowl = salladbowl
    room.players[playerId] = {
      name,
      notes
    }

    Object.keys(room.players).forEach(playerId => {
      if (state.players && state.players[playerId]) {
        state.players[playerId].send(JSON.stringify(room))
      }
    })

    res.sendStatus(HttpStatus.NO_CONTENT)
  } catch (err) {
    console.log(err)
    res.status(HttpStatus.NOT_FOUND).send(err)
  }
})

app.post('/api/startGame', (req, res) => {
  const { roomId } = req.body

  try {
    const room = state.rooms.find(r => r.roomId === roomId)

    room.salladBowl = Object.keys(room.players).reduce((acc, curr) => {
      acc.push(...room.players[curr].notes)
      return acc
    }, [])
    room.round1 = room.salladBowl.slice(0)
    room.round2 = room.salladBowl.slice(0)
    room.round3 = room.salladBowl.slice(0)
    room.activeRound = 1

    Object.keys(room.players).forEach(playerId => {
      if (state.players && state.players[playerId]) {
        state.players[playerId].send(JSON.stringify(room))
      }
    })
  } catch (err) {
    console.log(err)
    res.status(HttpStatus.NOT_FOUND).send(err)
  }
})

server.listen(process.env.PORT || 8080, () => {
  console.log(`Server started on port ${server.address().port}`)
})
