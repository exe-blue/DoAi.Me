import { NextRequest } from "next/server";
import { auth0 } from "@/lib/auth0";

export const GET = async (req: NextRequest) => auth0.middleware(req);
export const POST = async (req: NextRequest) => auth0.middleware(req);
