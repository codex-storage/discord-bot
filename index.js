require('dotenv').config();

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Command registration
const commands = [
  new SlashCommandBuilder()
    .setName('node')
    .setDescription('Verify your node and get the ALTRUISTIC MODE role')
    .addStringOption(option =>
      option
        .setName('nodeid')
        .setDescription('Your Node ID')
        .setRequired(true)
    ),
];

// Register commands when bot starts
client.once('ready', async () => {
  try {
    console.log('Started refreshing application (/) commands.');
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
    
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
    console.log(`Logged in as ${client.user.tag}!`);
  } catch (error) {
    console.error('Error refreshing commands:', error);
  }
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'node') {
    await handleNodeVerification(interaction);
  }
});

async function handleNodeVerification(interaction) {
  try {
    // Defer reply as the verification might take a moment
    await interaction.deferReply();

    const nodeId = interaction.options.getString('nodeid');

    // Check if nodeId is valid format
    if (!/^[a-zA-Z0-9-_]{1,64}$/.test(nodeId)) {
      return await interaction.editReply({
        content: '❌ Invalid Node ID format. Please provide a valid Node ID.',
        ephemeral: true
      });
    }

    // Check if node exists in database and is active (within last 24 hours)
    const { data: node, error } = await supabase
      .from('node_records')
      .select('*')
      .eq('node_id', nodeId)
      .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .single();

    if (error || !node) {
      return await interaction.editReply({
        content: '❌ No active node found with this ID. Make sure your node is running and try again.',
        ephemeral: true
      });
    }

    // Get the role
    const role = interaction.guild.roles.cache.find(r => r.name === 'Altruistic Mode');
    
    if (!role) {
      return await interaction.editReply({
        content: '❌ Error: ALTRUISTIC MODE role not found in the server. Please contact an administrator.',
        ephemeral: true
      });
    }

    // Check if user already has the role
    if (interaction.member.roles.cache.has(role.id)) {
      return await interaction.editReply({
        content: '✨ You already have the ALTRUISTIC MODE role!',
        ephemeral: true
      });
    }

    // Add role to user
    await interaction.member.roles.add(role);

    // Send success message
    await interaction.editReply({
      content: `🎉 Congratulations! Your node has been verified and you've been granted the ALTRUISTIC MODE role!\n\n` +
               `Node Details:\n` +
               `• Node ID: ${node.node_id}\n` +
               `• Version: ${node.version}\n` +
               `• Peer Count: ${node.peer_count}\n` +
               `• Last Active: ${new Date(node.timestamp).toLocaleString()}`,
      ephemeral: true
    });

  } catch (error) {
    console.error('Error in node verification:', error);
    await interaction.editReply({
      content: '❌ An error occurred while verifying your node. Please try again later.',
      ephemeral: true
    });
  }
}

// Error handling
client.on('error', error => {
  console.error('Discord client error:', error);
});

// Login to Discord
client.login(process.env.DISCORD_BOT_TOKEN);