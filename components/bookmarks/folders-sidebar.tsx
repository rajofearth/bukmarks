"use client";

import { useDndContext, useDroppable } from "@dnd-kit/core";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutGridIcon,
  MoreHorizontalIcon,
  PencilIcon,
  TrashIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { DragData, Folder } from "@/components/bookmarks/types";
import { FOLDER_ID_ALL } from "@/lib/bookmarks-utils";

const AddFolderDialog = dynamic(
  () =>
    import("@/components/bookmarks/add-folder-dialog").then((mod) => ({
      default: mod.AddFolderDialog,
    })),
  { ssr: false },
);

import { FolderIconDisplay } from "@/components/bookmarks/folder-icon";
import { BukmarksLogo } from "@/components/bukmarks-logo";
import { UserProfile } from "@/components/bookmarks/user-profile";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Editable,
  EditableArea,
  EditableInput,
  EditablePreview,
} from "@/components/ui/editable";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { cn } from "@/lib/utils";

interface FoldersSidebarProps {
  folders: Folder[];
  selectedFolder: string;
  contentMode: "bookmarks" | "folders";
  onSelectContentMode: (mode: "bookmarks" | "folders") => void;
  onSelectFolder: (folderId: string) => void;
  onAddFolder?: (name: string) => void;
  onRenameFolder?: (folderId: string, newName: string) => void;
  onDeleteFolder?: (folderId: string) => void;
  onSettings?: () => void;
  /** Optional class for the root container (e.g. for use in a sheet on mobile). */
  className?: string;
}

interface DroppableFolderItemProps {
  folder: Folder;
  selectedFolder: string;
  contentMode: "bookmarks" | "folders";
  onSelectFolder: (folderId: string) => void;
  onRenameFolder?: (folderId: string, newName: string) => void;
  onDeleteFolder?: (folderId: string) => void;
}

const ICON_BUTTON_WIDTH =
  "1.5rem"; /* 24px - keep badge alignment across rows */

function DroppableFolderItem({
  folder,
  selectedFolder,
  contentMode,
  onSelectFolder,
  onRenameFolder,
  onDeleteFolder,
}: DroppableFolderItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const { active } = useDndContext();
  const activeData = active?.data.current as DragData | null;
  const isDraggingBookmark = activeData?.type === "bookmark";
  const droppable = folder.id !== FOLDER_ID_ALL;
  const isEditableFolder = folder.id !== FOLDER_ID_ALL;
  const { setNodeRef, isOver } = useDroppable({
    id: folder.id,
    disabled: !droppable,
    data: {
      type: "folder",
      folderId: folder.id,
    },
  });

  const handleRowClick = () => {
    onSelectFolder(folder.id);
  };

  const handleRowKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelectFolder(folder.id);
    }
  };

  return (
    <>
      <Item
        key={folder.id}
        size="xs"
        asChild
        ref={droppable ? setNodeRef : undefined}
        className={cn(
          "cursor-pointer rounded-md px-2 transition-all",
          contentMode === "bookmarks" &&
            selectedFolder === folder.id &&
            "bg-accent",
          droppable &&
            isDraggingBookmark &&
            "border border-dashed border-border/60 bg-accent/40",
          droppable &&
            isOver &&
            "bg-accent/80 ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* biome-ignore lint/a11y/useSemanticElements: This row contains nested interactive controls (rename + actions). */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleRowClick}
          onKeyDown={handleRowKeyDown}
          className="relative flex w-full items-center gap-2 outline-none"
          aria-current={
            contentMode === "bookmarks" && selectedFolder === folder.id
              ? "true"
              : undefined
          }
        >
          <AnimatePresence>
            {isHovered && (
              <motion.div
                layoutId="folders-sidebar-hover-bg"
                className="absolute inset-0 z-0 rounded-md bg-accent/50 pointer-events-none"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{
                  layout: { type: "spring", stiffness: 400, damping: 30 },
                  opacity: { duration: 0.15 },
                  scale: { duration: 0.15 },
                }}
              />
            )}
          </AnimatePresence>
          <ItemMedia className="relative z-10 text-muted-foreground">
            <FolderIconDisplay folder={folder} />
          </ItemMedia>
          <ItemContent className="relative z-10 min-w-0 flex-1">
            {isEditableFolder && onRenameFolder ? (
              <Editable
                defaultValue={folder.name}
                triggerMode="dblclick"
                editing={editing}
                onEditingChange={setEditing}
                onSubmit={(value) => {
                  const trimmed = value.trim();
                  if (trimmed) onRenameFolder(folder.id, trimmed);
                }}
                className="min-w-0"
              >
                <EditableArea>
                  <EditablePreview className="truncate text-sm font-normal" />
                  <EditableInput className="truncate text-sm font-normal" />
                </EditableArea>
              </Editable>
            ) : (
              <ItemTitle className="truncate text-sm font-normal">
                {folder.name}
              </ItemTitle>
            )}
          </ItemContent>
          <ItemActions className="relative z-10 flex items-center gap-1">
            {/* Fixed-width slot so badge aligns across rows; icon visible only on hover for folders */}
            <span
              className="flex shrink-0 items-center justify-end"
              style={{ width: ICON_BUTTON_WIDTH }}
            >
              {isEditableFolder && (onDeleteFolder || onRenameFolder) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        "rounded p-1 opacity-70 hover:opacity-100 hover:bg-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-opacity",
                        !isHovered && "opacity-0 pointer-events-none",
                      )}
                      aria-label="Folder actions"
                    >
                      <MoreHorizontalIcon className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {onRenameFolder && (
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(true);
                        }}
                      >
                        <PencilIcon className="size-4" />
                        Rename
                      </DropdownMenuItem>
                    )}
                    {onDeleteFolder && (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <TrashIcon className="size-4" />
                        Delete folder
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </span>
            <Badge
              variant="secondary"
              className="text-xs tabular-nums shrink-0"
            >
              {folder.count}
            </Badge>
          </ItemActions>
        </div>
      </Item>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder</AlertDialogTitle>
            <AlertDialogDescription>
              Delete folder &quot;{folder.name}&quot;? All {folder.count}{" "}
              bookmark
              {folder.count === 1 ? "" : "s"} in this folder will be permanently
              deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                onDeleteFolder?.(folder.id);
                setDeleteDialogOpen(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function FoldersSidebar({
  folders,
  selectedFolder,
  contentMode,
  onSelectContentMode,
  onSelectFolder,
  onAddFolder,
  onRenameFolder,
  onDeleteFolder,
  onSettings,
  className,
}: FoldersSidebarProps) {
  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex flex-col gap-4 p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <span id="folders-sidebar-label" className="sr-only">
            Folders
          </span>
          <BukmarksLogo href="/" size="sm" showLabel />
          <AddFolderDialog onSubmit={onAddFolder} />
        </div>
      </div>
      <nav
        className="flex-1 overflow-y-auto px-2 min-h-0"
        aria-label="Folders"
        aria-labelledby="folders-sidebar-label"
      >
        <ItemGroup className="gap-0.5">
          <Item
            size="xs"
            className={cn(
              "cursor-pointer rounded-md px-2 transition-all",
              contentMode === "folders" && "bg-accent",
            )}
            onClick={() => onSelectContentMode("folders")}
          >
            <ItemMedia className="text-muted-foreground">
              <LayoutGridIcon className="size-4" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle className="truncate text-sm font-normal">
                Folders
              </ItemTitle>
            </ItemContent>
          </Item>
          {folders.map((folder) => (
            <DroppableFolderItem
              key={folder.id}
              folder={folder}
              selectedFolder={selectedFolder}
              contentMode={contentMode}
              onSelectFolder={(folderId) => {
                onSelectContentMode("bookmarks");
                onSelectFolder(folderId);
              }}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
            />
          ))}
        </ItemGroup>
      </nav>

      {/* User Profile Section */}
      <UserProfile onSettings={onSettings} />
    </div>
  );
}
