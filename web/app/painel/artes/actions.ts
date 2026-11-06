"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { requireAccount, requireOperator } from "@/lib/account";
import {
  ARTWORK_SIDES,
  artworkType,
  checkArtworkFile,
  cleanFileName,
  extensionOf,
  isArtworkPath,
  type ArtworkSide,
} from "@/lib/artes";
import { isUuid } from "@/lib/campanhas";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "../operacao/actions";

/**
 * Envio e revisão das artes.
 *
 * O envio tem duas pontas, porque o arquivo não passa pelo servidor do app:
 *
 *   1. `startArtworkUpload` pede ao Storage uma URL assinada para um caminho
 *      novo, com a sessão de quem envia. A policy do bucket decide ali se essa
 *      pessoa pode mandar arte para essa campanha.
 *   2. O navegador sobe o arquivo direto para a URL.
 *   3. `finishArtworkUpload` lê do Storage o tamanho e o tipo do que chegou e
 *      grava a versão em `artworks` (de novo pela RLS).
 *
 * Anunciante e operador usam as mesmas funções: o operador também sobe a arte
 * que o anunciante mandou pelo WhatsApp.
 */

const BUCKET = "artes";

export type UploadTicket = { ok: true; path: string; url: string } | { ok: false; message: string };
export type UploadResult = { ok: true } | { ok: false; message: string };

type FileInfo = { name: string; type: string; size: number };

function isSide(value: unknown): value is ArtworkSide {
  return typeof value === "string" && (ARTWORK_SIDES as readonly string[]).includes(value);
}

export async function startArtworkUpload(campaignId: string, side: ArtworkSide, file: FileInfo): Promise<UploadTicket> {
  await requireAccount();
  if (!isUuid(campaignId) || !isSide(side)) return { ok: false, message: "Campanha não encontrada." };
  const problem = checkArtworkFile(file);
  if (problem) return { ok: false, message: problem };

  const path = `${campaignId.toLowerCase()}/${randomUUID()}.${extensionOf(artworkType(file)!)}`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[artes] URL de envio:", error?.message);
    return { ok: false, message: "Esta campanha não está recebendo arte agora. Fale com a Qlareo." };
  }
  return { ok: true, path, url: data.signedUrl };
}

export async function finishArtworkUpload(
  campaignId: string,
  side: ArtworkSide,
  path: string,
  fileName: string,
): Promise<UploadResult> {
  await requireAccount();
  if (!isUuid(campaignId) || !isSide(side) || typeof path !== "string" || !isArtworkPath(path, campaignId)) {
    return { ok: false, message: "Envio inválido. Tente de novo." };
  }

  const supabase = await createClient();
  // O tamanho e o tipo vêm do Storage, não do navegador.
  const info = await supabase.storage.from(BUCKET).info(path);
  if (info.error || !info.data) {
    console.error("[artes] arquivo não chegou:", info.error?.message);
    return { ok: false, message: "O arquivo não chegou. Tente de novo." };
  }

  const { error } = await supabase.from("artworks").insert({
    campaign_id: campaignId,
    side,
    storage_path: path,
    file_name: cleanFileName(typeof fileName === "string" ? fileName : ""),
    content_type: info.data.contentType,
    size_bytes: info.data.size,
  });
  if (error) {
    console.error("[artes] gravar versão:", error.code, error.message);
    if (error.code === "42501") return { ok: false, message: "Esta campanha não está recebendo arte agora. Fale com a Qlareo." };
    return { ok: false, message: "Não deu para registrar o envio. Tente de novo." };
  }

  refresh();
  return { ok: true };
}

/**
 * A Qlareo registra o resultado da revisão: aprovada (conferida e aprovada pelo
 * restaurante) ou ajuste, que precisa dizer o que mudar.
 */
export async function reviewArtwork(artworkId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireOperator();
  if (!isUuid(artworkId)) return { status: "error", message: "Arte não encontrada." };

  const decision = formData.get("decision");
  const rawNote = formData.get("review_note");
  const note = typeof rawNote === "string" ? rawNote.trim() : "";
  const values = { review_note: note };

  if (decision !== "aprovada" && decision !== "ajustes") return { status: "error", message: "Escolha aprovar ou pedir ajuste." };
  if (decision === "ajustes" && !note) {
    return { status: "error", fields: { review_note: "Diga o que precisa mudar. O anunciante vê esta nota." }, values };
  }
  if (note.length > 1000) return { status: "error", fields: { review_note: "Use até 1.000 caracteres." }, values };

  const supabase = await createClient();
  const { error } = await supabase
    .from("artworks")
    .update({ status: decision, review_note: note || null, reviewed_at: new Date().toISOString() })
    .eq("id", artworkId);
  if (error) {
    console.error("[artes] revisar:", error.code, error.message);
    return { status: "error", message: "Não deu para salvar. Tente de novo.", values };
  }

  refresh();
  return { status: "saved", message: decision === "aprovada" ? "Arte aprovada." : "Ajuste pedido ao anunciante." };
}
