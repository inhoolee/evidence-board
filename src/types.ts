export type EvidenceType = 'photo' | 'note' | 'report';

export interface Position {
  x: number;
  y: number;
}

export interface EvidenceItem {
  id: string;
  type: EvidenceType;
  title: string;
  content?: string;
  imageUrl?: string;
  imageSource?: 'remote' | 'upload';
  fileNumber?: string;
  rotation: number;
  position: Position;
  pinColor: string;
}

export interface Connection {
  id: string;
  fromId: string;
  toId: string;
}
