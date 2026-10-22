package com.daniel.hyrcon;

import com.hypixel.hytale.server.core.NameMatching;
import com.hypixel.hytale.server.core.command.system.CommandManager;
import com.hypixel.hytale.server.core.command.system.CommandSender;
import com.hypixel.hytale.server.core.console.ConsoleSender;
import com.hypixel.hytale.server.core.plugin.JavaPlugin;
import com.hypixel.hytale.server.core.plugin.JavaPluginInit;
import com.hypixel.hytale.server.core.universe.PlayerRef;
import com.hypixel.hytale.server.core.universe.Universe;

import java.io.DataInputStream;
import java.io.EOFException;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Collection;
import java.util.Properties;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;

public class HyRconPlugin extends JavaPlugin {
    private ServerSocket serverSocket;
    private ExecutorService executor;
    private volatile boolean running = false;
    private String rconHost = "127.0.0.1";
    private int rconPort = 25575;
    private String rconPassword = "hytale_rcon_local";

    public HyRconPlugin(JavaPluginInit init) {
        super(init);
    }

    @Override
    protected void setup() {
        loadOrCreateConfig();
    }

    @Override
    protected void start() {
        running = true;
        executor = Executors.newCachedThreadPool(r -> {
            Thread t = new Thread(r, "HyRCON-Worker");
            t.setDaemon(true);
            return t;
        });

        try {
            serverSocket = new ServerSocket(rconPort, 50, InetAddress.getByName(rconHost));
            getLogger().at(Level.INFO).log("[HyRCON] Servidor RCON escuchando en " + rconHost + ":" + rconPort);
            executor.submit(this::acceptLoop);
        } catch (IOException e) {
            getLogger().at(Level.SEVERE).withCause(e).log("[HyRCON] No se pudo abrir el puerto RCON " + rconPort);
        }
    }

    @Override
    protected void shutdown() {
        running = false;
        if (serverSocket != null && !serverSocket.isClosed()) {
            try {
                serverSocket.close();
            } catch (IOException ignored) {
            }
        }
        if (executor != null) {
            executor.shutdownNow();
        }
        getLogger().at(Level.INFO).log("[HyRCON] Servidor RCON detenido.");
    }

    private void loadOrCreateConfig() {
        try {
            Path configPath = Paths.get("rcon.properties");
            Properties props = new Properties();
            if (Files.exists(configPath)) {
                try (FileInputStream in = new FileInputStream(configPath.toFile())) {
                    props.load(in);
                }
                rconHost = props.getProperty("host", "127.0.0.1").trim();
                rconPort = Integer.parseInt(props.getProperty("port", "25575").trim());
                rconPassword = props.getProperty("password", "hytale_rcon_local").trim();
            } else {
                props.setProperty("host", rconHost);
                props.setProperty("port", String.valueOf(rconPort));
                props.setProperty("password", rconPassword);
                try (FileOutputStream out = new FileOutputStream(configPath.toFile())) {
                    props.store(out, "Configuracion local de HyRCON para TikTok Live");
                }
            }
        } catch (Exception e) {
            getLogger().at(Level.WARNING).withCause(e).log("[HyRCON] Usando configuracion RCON por defecto.");
        }
    }

    private void acceptLoop() {
        while (running && serverSocket != null && !serverSocket.isClosed()) {
            try {
                Socket client = serverSocket.accept();
                client.setTcpNoDelay(true);
                executor.submit(() -> handleClient(client));
            } catch (IOException e) {
                if (running) {
                    getLogger().at(Level.WARNING).log("[HyRCON] Error aceptando conexion RCON: " + e.getMessage());
                }
            }
        }
    }

    private void handleClient(Socket client) {
        boolean authenticated = false;
        try (Socket sock = client;
             DataInputStream in = new DataInputStream(sock.getInputStream());
             OutputStream out = sock.getOutputStream()) {

            while (running && !sock.isClosed()) {
                int length = readLittleEndianInt(in);
                if (length < 10 || length > 65536) {
                    break;
                }

                byte[] payload = new byte[length];
                in.readFully(payload);

                ByteBuffer buf = ByteBuffer.wrap(payload).order(ByteOrder.LITTLE_ENDIAN);
                int requestId = buf.getInt();
                int type = buf.getInt();

                int bodyLen = length - 10;
                String body = new String(payload, 8, Math.max(0, bodyLen), StandardCharsets.UTF_8);

                if (type == 3) { // SERVERDATA_AUTH
                    if (!rconPassword.isEmpty() && rconPassword.equals(body)) {
                        authenticated = true;
                        sendPacket(out, requestId, 2, "");
                    } else {
                        authenticated = false;
                        sendPacket(out, -1, 2, "");
                        break;
                    }
                } else if (type == 2) { // SERVERDATA_EXECCOMMAND
                    if (!authenticated) {
                        sendPacket(out, -1, 2, "No autenticado");
                        break;
                    }
                    String response = executeHytaleCommand(body);
                    sendPacket(out, requestId, 0, response);
                } else {
                    sendPacket(out, requestId, 0, "");
                }
            }
        } catch (EOFException ignored) {
            // Cliente cerro la conexion normalmente
        } catch (Exception e) {
            if (running) {
                getLogger().at(Level.FINE).log("[HyRCON] Conexion RCON cerrada: " + e.getMessage());
            }
        }
    }

    private String executeHytaleCommand(String rawCommand) {
        if (rawCommand == null) {
            return "";
        }
        String cmd = rawCommand.trim();
        if (cmd.startsWith("/")) {
            cmd = cmd.substring(1).trim();
        }
        if (cmd.isEmpty()) {
            return "";
        }

        try {
            CommandSender sender = ConsoleSender.INSTANCE;
            String finalCmd = cmd;

            // Soporte para "as <jugador> <comando>" (ej. "as PaletaChupada npc spawn Skeleton")
            if (cmd.regionMatches(true, 0, "as ", 0, 3)) {
                String rest = cmd.substring(3).trim();
                int spaceIdx = rest.indexOf(' ');
                if (spaceIdx > 0) {
                    String targetName = rest.substring(0, spaceIdx).trim();
                    finalCmd = rest.substring(spaceIdx + 1).trim();
                    if (finalCmd.startsWith("/")) {
                        finalCmd = finalCmd.substring(1).trim();
                    }
                    PlayerRef targetPlayer = findOnlinePlayer(targetName);
                    if (targetPlayer == null) {
                        return "Jugador '" + targetName + "' no esta conectado en el mundo actualmente.";
                    }
                    sender = targetPlayer;
                }
            } else if (cmd.regionMatches(true, 0, "npc ", 0, 4)) {
                // Los comandos "/npc spawn ..." requieren ejecutarse con la posicion de un jugador en el mundo
                PlayerRef targetPlayer = findOnlinePlayer(null);
                if (targetPlayer == null) {
                    return "No hay ningun jugador en el mundo para spawnear el NPC.";
                }
                sender = targetPlayer;
            }

            getLogger().at(Level.INFO).log("[HyRCON] Ejecutando (" + sender.getUsername() + "): /" + finalCmd);
            CommandManager.get().handleCommand(sender, finalCmd).get(5, TimeUnit.SECONDS);
            return "OK: /" + finalCmd;
        } catch (Exception e) {
            return "Error ejecutando comando: " + e.getMessage();
        }
    }

    private PlayerRef findOnlinePlayer(String preferredName) {
        Universe universe = Universe.get();
        if (universe == null) {
            return null;
        }
        if (preferredName != null && !preferredName.isEmpty()) {
            PlayerRef exact = universe.getPlayerByUsername(preferredName, NameMatching.EXACT_IGNORE_CASE);
            if (exact != null && exact.isValid()) {
                return exact;
            }
            PlayerRef startsWith = universe.getPlayerByUsername(preferredName, NameMatching.STARTS_WITH_IGNORE_CASE);
            if (startsWith != null && startsWith.isValid()) {
                return startsWith;
            }
        }
        Collection<PlayerRef> players = universe.getPlayers();
        if (players != null) {
            for (PlayerRef p : players) {
                if (p != null && p.isValid()) {
                    return p;
                }
            }
        }
        return null;
    }

    private static int readLittleEndianInt(DataInputStream in) throws IOException {
        int b1 = in.read();
        int b2 = in.read();
        int b3 = in.read();
        int b4 = in.read();
        if ((b1 | b2 | b3 | b4) < 0) {
            throw new EOFException();
        }
        return (b1) | (b2 << 8) | (b3 << 16) | (b4 << 24);
    }

    private static void sendPacket(OutputStream out, int requestId, int type, String body) throws IOException {
        byte[] bodyBytes = (body != null ? body : "").getBytes(StandardCharsets.UTF_8);
        int length = 4 + 4 + bodyBytes.length + 2;
        ByteBuffer buf = ByteBuffer.allocate(4 + length).order(ByteOrder.LITTLE_ENDIAN);
        buf.putInt(length);
        buf.putInt(requestId);
        buf.putInt(type);
        buf.put(bodyBytes);
        buf.put((byte) 0);
        buf.put((byte) 0);
        synchronized (out) {
            out.write(buf.array());
            out.flush();
        }
    }
}
