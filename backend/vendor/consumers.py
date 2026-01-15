import json
from channels.generic.websocket import AsyncWebsocketConsumer
from core.tasks import generate_product_details_task

class HelperConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()

    async def disconnect(self, close_code):
        pass

    async def receive(self, text_data):
        data = json.loads(text_data)
        # Expected: { 'image_id': 123, 'price': 29.99 }
        # Or if waiting for upload, maybe we just wait for task trigger.
        
        # Scenario: Frontend uploads file, gets ID. Connects WS. Sends ID.
        if 'image_id' in data:
            image_id = data['image_id']
            price = data.get('price')
            
            # Add to group based on image_id or user
            # For simplicity, we can use the channel name for the one-off task response
            
            # Run Celery Task
            # We pass self.channel_name so the task knows where to reply
            generate_product_details_task.delay(self.channel_name, image_id, price)
            
            await self.send(text_data=json.dumps({
                'status': 'processing',
                'message': 'AI analysis started...'
            }))

    async def task_update(self, event):
        # Handler for messages sent from Celery task
        await self.send(text_data=json.dumps(event['data']))
