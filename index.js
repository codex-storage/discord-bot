require('dotenv').config();

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
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
    )
    .setDefaultMemberPermissions('0') // Make command private
    .setDMPermission(false), // Disable DM usage
];

// Register commands when bot starts
client.once('ready', async () => {
  try {
    console.log('Started refreshing application (/) commands.');
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
    
    // Register commands for the first guild the bot is in
    const guild = client.guilds.cache.first();
    if (guild) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guild.id),
        { body: commands },
      );
      console.log(`Bot is ready as ${client.user.tag} in guild ${guild.name}!`);
    }
  } catch (error) {
    console.error('Error:', error);
  }
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'node') return;

  try {
    // Initial reply is ephemeral (only visible to the command user)
    await interaction.deferReply({ ephemeral: true });
    
    // Check bot permissions first
    if (!interaction.guild.members.me.permissions.has('ManageRoles')) {
      await interaction.editReply({
        content: '❌ Bot is missing permissions. Please give the bot "Manage Roles" permission and make sure its role is above the "Altruistic Mode" role.',
        ephemeral: true
      });
      return;
    }
    
    const nodeId = interaction.options.getString('nodeid');
    
    // Check database for node
    const { data: node } = await supabase
      .from('node_records')
      .select('*')
      .eq('node_id', nodeId)
      .single();

    if (!node) {
      await interaction.editReply({
        content: '❌ No node found with this ID.',
        ephemeral: true
      });
      return;
    }

    // Get and assign role
    const role = interaction.guild.roles.cache.find(r => r.name === 'Altruistic Mode');
    if (!role) {
      await interaction.editReply({
        content: '❌ Could not find the "Altruistic Mode" role.',
        ephemeral: true
      });
      return;
    }

    // Check if bot's role is higher than the role it's trying to assign
    if (interaction.guild.members.me.roles.highest.position <= role.position) {
      await interaction.editReply({
        content: '❌ Bot\'s role must be higher than the "Altruistic Mode" role in the server settings.',
        ephemeral: true
      });
      return;
    }

    // Try to add the role
    try {
      await interaction.member.roles.add(role);
      await interaction.editReply({
        content: '✅ Role granted successfully!',
        ephemeral: true
      });
    } catch (roleError) {
      console.error('Role assignment error:', roleError);
      await interaction.editReply({
        content: '❌ Failed to assign role. Please check bot permissions.',
        ephemeral: true
      });
    }

  } catch (error) {
    console.error('Error:', error);
    await interaction.editReply({
      content: '❌ An error occurred.',
      ephemeral: true
    });
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);