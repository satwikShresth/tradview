import { streamer } from './streamer.service';

// Demonstrate the streaming functionality
console.log('🚀 Starting TradView Price Streaming Demo');
console.log('=====================================');

// Simulate multiple consumers joining and leaving streams
async function demonstrateStreaming() {
   console.log('\n📊 Demo: Multiple consumers for BTCUSD');

   // Consumer 1 subscribes to BTCUSD
   const consumer1 = await streamer.subscribe('BTCUSD', (data) => {
      console.log(`[Consumer 1] ${data.ticker}: $${data.price} ${data.change || ''}`);
   });

   console.log('✅ Consumer 1 subscribed to BTCUSD');
   console.log(`Active streams: ${streamer.getActiveTickers().join(', ')}`);

   // Wait a bit to see some price updates
   await new Promise(resolve => setTimeout(resolve, 10000));

   // Consumer 2 joins the same BTCUSD stream
   const consumer2 = await streamer.subscribe('BTCUSD', (data) => {
      console.log(`[Consumer 2] ${data.ticker}: $${data.price} ${data.change || ''}`);
   });

   console.log('✅ Consumer 2 joined BTCUSD stream');
   console.log(`BTCUSD consumer count: ${streamer.getConsumerCount('BTCUSD')}`);

   // Wait to see both consumers receiving data
   await new Promise(resolve => setTimeout(resolve, 10000));

   // Consumer 3 subscribes to ETHUSD (new stream)
   const consumer3 = await streamer.subscribe('ETHUSD', (data) => {
      console.log(`[Consumer 3] ${data.ticker}: $${data.price} ${data.change || ''}`);
   });

   console.log('✅ Consumer 3 subscribed to ETHUSD');
   console.log(`Active streams: ${streamer.getActiveTickers().join(', ')}`);

   // Show stream info
   console.log('\n📈 Current Stream Status:');
   streamer.getStreamInfo().forEach(info => {
      console.log(`  ${info.ticker}: ${info.consumerCount} consumers, active: ${info.isActive}`);
   });

   // Wait to see all streams active
   await new Promise(resolve => setTimeout(resolve, 15000));

   // Consumer 1 leaves
   console.log('\n👋 Consumer 1 leaving BTCUSD...');
   await streamer.unsubscribe(consumer1);
   console.log(`BTCUSD consumer count: ${streamer.getConsumerCount('BTCUSD')}`);

   // Wait a bit more
   await new Promise(resolve => setTimeout(resolve, 10000));

   // Consumer 2 leaves (should close BTCUSD stream)
   console.log('\n👋 Consumer 2 leaving BTCUSD...');
   await streamer.unsubscribe(consumer2);
   console.log(`BTCUSD consumer count: ${streamer.getConsumerCount('BTCUSD')}`);
   console.log(`Active streams: ${streamer.getActiveTickers().join(', ')}`);

   // Wait to see BTCUSD stream closed
   await new Promise(resolve => setTimeout(resolve, 5000));

   // Consumer 3 leaves (should close ETHUSD stream)
   console.log('\n👋 Consumer 3 leaving ETHUSD...');
   await streamer.unsubscribe(consumer3);
   console.log(`Active streams: ${streamer.getActiveTickers().join(', ')}`);

   console.log('\n🎉 Demo completed! All streams should be closed.');
}

// Run the demonstration
demonstrateStreaming().catch(console.error);
