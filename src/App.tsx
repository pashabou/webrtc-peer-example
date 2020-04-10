import React, { useState, useEffect } from "react";
import { Input, Button } from "reactstrap";
import io from "socket.io-client";

let socket = io("localhost:4000");

interface Message {
  text: string;
}

function App() {
  let [partyCode, setPartyCode] = useState("");
  let [messages, setMessages] = useState(
    new Array<Message>({ text: "Beginning of chat" })
  );
  let [peers, setPeers] = useState(new Map<string, RTCPeerConnection>());
  let [channels, setChannels] = useState(new Map<string, RTCDataChannel>());

  useEffect(() => {
    // received by host when creating party
    socket.on("join_code", (code: any) => setPartyCode(code));
    // received by peer when party code is invalid
    socket.on("join_failed", () => {
      alert("Invalid party code");
      setPartyCode("");
    });
    // received by peer when party code is valid
    socket.on("join_success", (host: any, channelId: any) => {
      console.log("Connecting to host", host);
      let connection = new RTCPeerConnection();
      connection.onicecandidate = (event) => {
        console.log("new candidate", event.candidate);
        if (event.candidate)
          socket.emit("rtc_candidate", host, event.candidate);
      };
      let channel = connection.createDataChannel(socket.id, {
        negotiated: true,
        id: channelId,
      });
      channel.onmessage = (event) => console.log(event.data);
      channel.onopen = () => console.log(channel.readyState);
      channel.onclose = () => {
        setPartyCode("");
        setPeers((p) => {
          p.delete(host);
          return p;
        });
        setChannels((c) => {
          c.delete(host);
          return c;
        });
      };

      connection
        .createOffer()
        .then((offer) => connection.setLocalDescription(offer))
        .then(() => socket.emit("rtc_offer", host, connection.localDescription))
        .catch((error) => alert("Connection error:" + error));

      setPeers((p) => p.set(host, connection));
      setChannels((c) => c.set(host, channel));
    });
    // received by host when player joins party
    socket.on("new_player", (id: any, channelId: any) => {
      console.log("Player joined", id);
      let connection = new RTCPeerConnection();
      connection.onsignalingstatechange = (event) => {
        console.log(connection.signalingState);
      };
      let channel = connection.createDataChannel(id, {
        negotiated: true,
        id: channelId,
      });
      channel.onmessage = (event) => console.log(event.data);
      channel.onopen = () => console.log(channel.readyState);
      channel.onclose = () => {
        setPeers((p) => {
          p.delete(id);
          return p;
        });
        setChannels((c) => {
          c.delete(id);
          return c;
        });
      };
      connection.onicecandidate = (event) => {
        console.log("new candidate", event.candidate);
        if (event.candidate) socket.emit("rtc_candidate", id, event.candidate);
      };
      setPeers((p) => p.set(id, connection));
      setChannels((c) => c.set(id, channel));
    });
    // received by host or peer when exchanging ICE candidates
    socket.on("rtc_candidate", (id: any, candidate: any) =>
      setPeers((p) => {
        console.log("received candidate", candidate, "from", id);
        let connection = p.get(id) as RTCPeerConnection;
        connection.addIceCandidate(candidate);
        return p.set(id, connection);
      })
    );
    // received by host when peer creates connection offer
    socket.on("rtc_offer", (id: any, message: any) => {
      let connection = peers.get(id) as RTCPeerConnection;
      console.log("offer from", id, "on", connection);
      connection
        .setRemoteDescription(message)
        .then(() => connection.createAnswer())
        .then((answer) => connection.setLocalDescription(answer))
        .then(() => setPeers((p) => p.set(id, connection)))
        .catch((error) => console.log("Connection error: " + error))
        .finally(() =>
          socket.emit("rtc_answer", id, connection.localDescription)
        );
    });
    // received by peer when host creates connection answer
    socket.on("rtc_answer", (id: any, message: any) => {
      let connection = peers.get(id) as RTCPeerConnection;
      console.log("answer from", id, "on", connection);
      connection
        .setRemoteDescription(message)
        .then(() => setPeers((p) => p.set(id, connection)))
        .catch((error) => console.log("Connection error: " + error));

      setInterval(() => {
        channels.forEach((channel) => {
          console.log(channel.readyState, channel);
          if (channel.readyState == "open") {
            channel.send("hello");
          } else {
            setTimeout(() => {
              if (channel.readyState != "open") {
                peers.get(id)?.close();
              }
            }, 3000);
          }
        });
      }, 1000);
    });
  }, []);

  return (
    <div style={{ margin: 20 }}>
      <div>
        <Button
          disabled={partyCode !== ""}
          onClick={() => socket.emit("create_party")}
          style={{ fontSize: 30 }}
        >
          Host Party
        </Button>
        <Button
          disabled={partyCode !== ""}
          onClick={() => {
            let code = prompt("Enter party code below:");
            setPartyCode(code ?? "");
            socket.emit("join_party", code);
          }}
          style={{ fontSize: 30 }}
        >
          Join Party
        </Button>
      </div>

      {partyCode === "" ? null : (
        <h1 style={{ margin: 20 }}>Party Code: {partyCode}</h1>
      )}
      <div />
      <Input placeholder="Type message here..."></Input>
      {messages.map((message, idx) => {
        return (
          <p key={idx} style={{ margin: 20 }}>
            {message.text}
          </p>
        );
      })}
    </div>
  );
}

export default App;
