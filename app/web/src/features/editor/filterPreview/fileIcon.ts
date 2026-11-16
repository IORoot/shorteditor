import { File, FileArchive, FileCode, FileText, Film, Image, Music, type LucideIcon } from 'lucide-react';

const BY_EXTENSION: Record<string, LucideIcon> = {
  mp4: Film, mov: Film, mkv: Film, m4v: Film, avi: Film, mts: Film, mxf: Film,
  md: FileText, txt: FileText, pdf: FileText,
  css: FileCode, js: FileCode, ts: FileCode, json: FileCode, html: FileCode,
  jpg: Image, jpeg: Image, png: Image, gif: Image, webp: Image,
  wav: Music, mp3: Music, aac: Music,
  zip: FileArchive, tar: FileArchive, gz: FileArchive,
};

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function iconForFile(name: string): LucideIcon {
  return BY_EXTENSION[extensionOf(name)] ?? File;
}
