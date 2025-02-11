/**
 * Copyright 2022 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Frame as BaseFrame} from '../api/Frame.js';
import {
  createDeferredPromise,
  DeferredPromise,
} from '../util/DeferredPromise.js';

/**
 * Keeps track of the page frame tree and it's is managed by
 * {@link FrameManager}. FrameTree uses frame IDs to reference frame and it
 * means that referenced frames might not be in the tree anymore. Thus, the tree
 * structure is eventually consistent.
 * @internal
 */
export class FrameTree<Frame extends BaseFrame> {
  #frames = new Map<string, Frame>();
  // frameID -> parentFrameID
  #parentIds = new Map<string, string>();
  // frameID -> childFrameIDs
  #childIds = new Map<string, Set<string>>();
  #mainFrame?: Frame;
  #waitRequests = new Map<string, Set<DeferredPromise<Frame>>>();

  getMainFrame(): Frame | undefined {
    return this.#mainFrame;
  }

  getById(frameId: string): Frame | undefined {
    return this.#frames.get(frameId);
  }

  /**
   * Returns a promise that is resolved once the frame with
   * the given ID is added to the tree.
   */
  waitForFrame(frameId: string): Promise<Frame> {
    const frame = this.getById(frameId);
    if (frame) {
      return Promise.resolve(frame);
    }
    const deferred = createDeferredPromise<Frame>();
    const callbacks =
      this.#waitRequests.get(frameId) || new Set<DeferredPromise<Frame>>();
    callbacks.add(deferred);
    return deferred;
  }

  frames(): Frame[] {
    return Array.from(this.#frames.values());
  }

  addFrame(frame: Frame): void {
    this.#frames.set(frame._id, frame);
    if (frame._parentId) {
      this.#parentIds.set(frame._id, frame._parentId);
      if (!this.#childIds.has(frame._parentId)) {
        this.#childIds.set(frame._parentId, new Set());
      }
      this.#childIds.get(frame._parentId)!.add(frame._id);
    } else {
      this.#mainFrame = frame;
    }
    this.#waitRequests.get(frame._id)?.forEach(request => {
      return request.resolve(frame);
    });
  }

  removeFrame(frame: Frame): void {
    this.#frames.delete(frame._id);
    this.#parentIds.delete(frame._id);
    if (frame._parentId) {
      this.#childIds.get(frame._parentId)?.delete(frame._id);
    } else {
      this.#mainFrame = undefined;
    }
  }

  childFrames(frameId: string): Frame[] {
    const childIds = this.#childIds.get(frameId);
    if (!childIds) {
      return [];
    }
    return Array.from(childIds)
      .map(id => {
        return this.getById(id);
      })
      .filter((frame): frame is Frame => {
        return frame !== undefined;
      });
  }

  parentFrame(frameId: string): Frame | undefined {
    const parentId = this.#parentIds.get(frameId);
    return parentId ? this.getById(parentId) : undefined;
  }
}
