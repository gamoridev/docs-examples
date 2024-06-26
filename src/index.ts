import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import express from "express";
import { createServer } from "http";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { PubSub } from "graphql-subscriptions";
import bodyParser from "body-parser";
import cors from "cors";

const PORT = 4000;
const pubsub = new PubSub();

// A number that we'll increment over time to simulate subscription events
let currentNumber = 0;

// Schema definition
const typeDefs = `#graphql
  type Query {
    currentNumber: Int
  }

  type Subscription {
    message: String
  }
`;

// Resolver map
const resolvers = {
  Query: {
    currentNumber() {
      return currentNumber;
    },
  },
  Subscription: {
    message: {
      subscribe: () => pubsub.asyncIterator(["MESSAGE_SENT"]),
    },
  },
};

// Create schema, which will be used separately by ApolloServer and
// the WebSocket server.
const schema = makeExecutableSchema({ typeDefs, resolvers });

// Create an Express app and HTTP server; we will attach the WebSocket
// server and the ApolloServer to this HTTP server.
const app = express();
const httpServer = createServer(app);

// Set up WebSocket server.
const wsServer = new WebSocketServer({
  server: httpServer,
  path: "/graphql",
});
const serverCleanup = useServer({ schema }, wsServer);

// Set up ApolloServer.
const server = new ApolloServer({
  schema,
  plugins: [
    // Proper shutdown for the HTTP server.
    ApolloServerPluginDrainHttpServer({ httpServer }),

    // Proper shutdown for the WebSocket server.
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose();
          },
        };
      },
    },
  ],
});

await server.start();
app.use(
  "/graphql",
  cors<cors.CorsRequest>(),
  bodyParser.json(),
  expressMiddleware(server)
);

// Now that our HTTP server is fully set up, actually listen.
httpServer.listen(PORT, () => {
  console.log(`🚀 Query endpoint ready at http://localhost:${PORT}/graphql`);
  console.log(
    `🚀 Subscription endpoint ready at ws://localhost:${PORT}/graphql`
  );
});

// In the background, increment a number every second and notify subscribers when it changes.
function sendMessage() {
  currentNumber++;
  pubsub.publish("MESSAGE_SENT", {
    message: `Mensagem #${currentNumber} recebida`,
  });
  setTimeout(sendMessage, 5000);
}

// Start incrementing
sendMessage();
