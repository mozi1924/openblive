interface TrieNode {
  children: Record<string, TrieNode>;
  value: any;
}

export class Trie {
  private _root: TrieNode;

  constructor() {
    this._root = this._createNode();
  }

  private _createNode(): TrieNode {
    return {
      children: {},
      value: null,
    };
  }

  set(key: string, value: any) {
    if (key === "") {
      throw new Error("key is empty");
    }
    let node = this._root;
    for (const char of key) {
      let nextNode = node.children[char];
      if (nextNode === undefined) {
        nextNode = node.children[char] = this._createNode();
      }
      node = nextNode;
    }
    node.value = value;
  }

  get(key: string): any {
    let node = this._root;
    for (const char of key) {
      let nextNode = node.children[char];
      if (nextNode === undefined) {
        return null;
      }
      node = nextNode;
    }
    return node.value;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  lazyMatch(str: string): any {
    let node = this._root;
    for (const char of str) {
      let nextNode = node.children[char];
      if (nextNode === undefined) {
        return null;
      }
      if (nextNode.value !== null) {
        return nextNode.value;
      }
      node = nextNode;
    }
    return null;
  }
}
