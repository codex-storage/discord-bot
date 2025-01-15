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
  {
    name: 'node',
    description: 'Verify your node and get roles',
    options: [{
      name: 'nodeid',
      description: 'Your Node ID',
      type: 3, // STRING type
      required: true
    }],
    default_member_permissions: null, // Allow everyone to use the command
    dm_permission: false
  },
  {
    name: 'checkroles',
    description: 'Check if your node is still active',
    default_member_permissions: null, // Allow everyone to use the command
    dm_permission: false
  }
];

// Register commands when bot starts
client.once('ready', async () => {
  try {
    console.log('Started refreshing application (/) commands.');
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
    
    // Register commands for the first guild the bot is in
    const guild = client.guilds.cache.first();
    if (!guild) {
      console.error('No guild found!');
      return;
    }

    console.log(`Registering commands for guild: ${guild.name} (${guild.id})`);

    try {
      // Delete existing commands first
      console.log('Deleting existing commands...');
      
      // Delete guild commands
      await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: [] });
      console.log('Successfully deleted existing commands.');

      // Register new commands
      console.log('Registering new commands...');
      const data = await rest.put(
        Routes.applicationGuildCommands(client.user.id, guild.id),
        { body: commands }
      );

      console.log(`Successfully registered ${data.length} commands!`);

      // Start the role check interval
      setInterval(() => checkInactiveNodes(guild), 24 * 60 * 60 * 1000);
    } catch (error) {
      console.error('Error managing commands:', error);
    }
  } catch (error) {
    console.error('Error in ready event:', error);
  }
});

// Function to check and remove roles from inactive nodes
async function checkInactiveNodes(guild, specificMember = null) {
  try {
    console.log('Checking for inactive nodes...');
    // Get both roles
    const activeRole = guild.roles.cache.find(r => r.name === 'Active Participant');
    const inactiveRole = guild.roles.cache.find(r => r.name === 'Inactive Participant');
    
    if (!activeRole) {
      console.error('Active Participant role not found');
      return false;
    }
    if (!inactiveRole) {
      console.error('Inactive Participant role not found');
      return false;
    }

    // If checking a specific member
    if (specificMember) {
      console.log(`Checking status for member: ${specificMember.user.tag} (${specificMember.user.id})`);
      
      // Get the most recent node record for this specific Discord user
      const { data: nodeRecords, error } = await supabase
        .from('node_records')
        .select('*')
        .eq('discord_user_id', specificMember.user.id)
        .order('timestamp', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error checking node records:', error);
        return false;
      }

      // Get one week ago timestamp
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      // Check if node is inactive
      const isInactive = !nodeRecords.length || new Date(nodeRecords[0].timestamp) < oneWeekAgo;
      console.log(`Node status - Records exist: ${nodeRecords.length > 0}, Last timestamp: ${nodeRecords.length ? new Date(nodeRecords[0].timestamp).toISOString() : 'none'}, Is inactive: ${isInactive}`);
      
      if (isInactive) {
        // Remove Active role and add Inactive role
        if (specificMember.roles.cache.has(activeRole.id)) {
          await specificMember.roles.remove(activeRole);
          await specificMember.roles.add(inactiveRole);
          console.log(`Changed ${specificMember.user.tag} to inactive status`);
        }
        return false;
      } else {
        // Add Active role and remove Inactive role if needed
        if (specificMember.roles.cache.has(inactiveRole.id)) {
          await specificMember.roles.remove(inactiveRole);
          await specificMember.roles.add(activeRole);
          console.log(`Changed ${specificMember.user.tag} to active status`);
        }
        return true;
      }
    }

    // If checking all members
    const membersWithRole = guild.members.cache.filter(member => 
      member.roles.cache.has(activeRole.id)
    );

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    for (const [_, member] of membersWithRole) {
      const { data: nodeRecords, error } = await supabase
        .from('node_records')
        .select('*')
        .eq('discord_user_id', member.user.id)
        .order('timestamp', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error checking node records:', error);
        continue;
      }

      if (!nodeRecords.length || new Date(nodeRecords[0].timestamp) < oneWeekAgo) {
        try {
          await member.roles.remove(activeRole);
          await member.roles.add(inactiveRole);
          console.log(`Changed ${member.user.tag} to inactive status due to inactivity`);
        } catch (error) {
          console.error(`Error updating roles for ${member.user.tag}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Error in checkInactiveNodes:', error);
    return false;
  }
}

// Handle slash commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'node') {
    try {
      await interaction.deferReply({ ephemeral: true });
      
      // Check bot permissions first
      if (!interaction.guild.members.me.permissions.has('ManageRoles')) {
        await interaction.editReply({
          content: '❌ Bot is missing permissions. Please give the bot "Manage Roles" permission and make sure its role is above the roles.',
          ephemeral: true
        });
        return;
      }
      
      const nodeId = interaction.options.getString('nodeid');
      console.log(`Processing verification for user: ${interaction.user.tag}`);
      
      // First, check if this Discord user already has a node
      const { data: existingUserNodes, error: userCheckError } = await supabase
        .from('node_records')
        .select('node_id')
        .eq('discord_user_id', interaction.user.id)
        .limit(1);

      if (userCheckError) {
        console.error('Error checking existing user nodes:', userCheckError);
        await interaction.editReply({
          content: '❌ Error checking user status.',
          ephemeral: true
        });
        return;
      }

      if (existingUserNodes && existingUserNodes.length > 0) {
        await interaction.editReply({
          content: '❌ You already have a node associated with your Discord account. Please contact the moderators if you need to change your node association.',
          ephemeral: true
        });
        return;
      }

      // Then, check if the node is already associated with another Discord user
      const { data: existingNodeUser, error: nodeCheckError } = await supabase
        .from('node_records')
        .select('discord_user_id')
        .eq('node_id', nodeId)
        .not('discord_user_id', 'is', null)
        .limit(1);

      if (nodeCheckError) {
        console.error('Error checking node association:', nodeCheckError);
        await interaction.editReply({
          content: '❌ Error checking node status.',
          ephemeral: true
        });
        return;
      }

      if (existingNodeUser && existingNodeUser.length > 0) {
        await interaction.editReply({
          content: '❌ This node is already associated with another Discord user. Please contact the moderators if you believe this is an error.',
          ephemeral: true
        });
        return;
      }

      // Now check if the node exists and is active (within last 24 hours)
      const { data: existingNode, error: findError } = await supabase
        .from('node_records')
        .select('*')
        .eq('node_id', nodeId)
        .order('timestamp', { ascending: false })
        .limit(1);

      if (findError) {
        console.error('Error finding node:', findError);
        await interaction.editReply({
          content: '❌ Error checking node status.',
          ephemeral: true
        });
        return;
      }

      if (!existingNode || existingNode.length === 0) {
        console.log('Node verification failed for user:', interaction.user.tag);
        await interaction.editReply({
          content: '❌ No node found with this ID. However, the bot only works for nodes setup using the [Codex CLI](https://github.com/codex-storage/cli) and does not work on manual installation of Codex as we do not log node information from the manual process.',
          ephemeral: true
        });
        return;
      }

      // Check if node is active (last update within 24 hours)
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      
      if (new Date(existingNode[0].timestamp) < oneDayAgo) {
        await interaction.editReply({
          content: '❌ This node has not been active in the last 24 hours. Please make sure your node is running and try again.',
          ephemeral: true
        });
        return;
      }

      // Get all roles first
      const altruisticRole = interaction.guild.roles.cache.find(r => r.name === 'Altruistic Mode');
      const activeRole = interaction.guild.roles.cache.find(r => r.name === 'Active Participant');
      const inactiveRole = interaction.guild.roles.cache.find(r => r.name === 'Inactive Participant');

      if (!altruisticRole || !activeRole || !inactiveRole) {
        await interaction.editReply({
          content: '❌ Could not find one or more required roles.',
          ephemeral: true
        });
        return;
      }

      // Check bot permissions
      if (!interaction.guild.members.me.permissions.has('ManageRoles')) {
        await interaction.editReply({
          content: '❌ Bot is missing "Manage Roles" permission.',
          ephemeral: true
        });
        return;
      }

      // Check if bot's role is higher than the roles it needs to assign
      const botRole = interaction.guild.members.me.roles.highest;
      if (botRole.position <= altruisticRole.position || 
          botRole.position <= activeRole.position || 
          botRole.position <= inactiveRole.position) {
        await interaction.editReply({
          content: '❌ Bot\'s role must be higher than the roles it needs to assign. Please move the bot\'s role up in the server settings.',
          ephemeral: true
        });
        return;
      }

      // Now update the discord_user_id
      console.log(`Attempting to update discord_user_id for node ${nodeId} to ${interaction.user.id}`);
      
      const { error: updateError } = await supabase
        .from('node_records')
        .update({ discord_user_id: interaction.user.id })
        .eq('node_id', nodeId)
        .eq('timestamp', existingNode[0].timestamp);

      if (updateError) {
        console.error('Error updating node:', updateError);
        await interaction.editReply({
          content: '❌ Error updating node information.',
          ephemeral: true
        });
        return;
      }

      console.log(`Successfully updated discord_user_id for node ${nodeId}`);

      // Add Altruistic and Active roles, remove Inactive role
      try {
        await interaction.member.roles.add([altruisticRole, activeRole]);
        if (interaction.member.roles.cache.has(inactiveRole.id)) {
          await interaction.member.roles.remove(inactiveRole);
        }
        console.log('Roles updated successfully for user:', interaction.user.tag);
        
        // Send private success message to user
        await interaction.editReply({
          content: '✅ Your node has been verified and roles have been granted!',
          ephemeral: true
        });

      } catch (roleError) {
        console.error('Role assignment error:', roleError);
        await interaction.editReply({
          content: '❌ Failed to update roles. The bot\'s role must be higher than the roles it needs to assign.',
          ephemeral: true
        });
      }

    } catch (error) {
      console.error('Error:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ An error occurred.',
            ephemeral: true
          });
        } else {
          await interaction.editReply({
            content: '❌ An error occurred.',
            ephemeral: true
          });
        }
      } catch (replyError) {
        console.error('Error sending error message:', replyError);
      }
    }
  } else if (interaction.commandName === 'checkroles') {
    try {
      await interaction.deferReply({ ephemeral: true });
      
      const isActive = await checkInactiveNodes(interaction.guild, interaction.member);
      
      if (isActive) {
        await interaction.editReply({
          content: '✅ Your node is active and roles are up to date.',
          ephemeral: true
        });
      } else {
        await interaction.editReply({
          content: '❌ No node found with this ID. However, the bot only works for nodes setup using the [Codex CLI](https://github.com/codex-storage/cli) and does not work on manual installation of Codex as we do not log node information from the manual process.',
          ephemeral: true
        });
      }
    } catch (error) {
      console.error('Error in role check:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ An error occurred.',
            ephemeral: true
          });
        } else {
          await interaction.editReply({
            content: '❌ An error occurred.',
            ephemeral: true
          });
        }
      } catch (replyError) {
        console.error('Error sending error message:', replyError);
      }
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);