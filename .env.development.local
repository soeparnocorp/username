import { createClient } from 'redis';
import { NextResponse } from 'next/server';

const redis = await createClient().connect();

export const POST = async () => {
  // Fetch data from Redis
  const result = await redis.get("item");
  
  // Return the result in the response
  return new NextResponse(JSON.stringify({ result }), { status: 200 });
};
