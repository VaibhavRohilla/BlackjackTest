import { GameManager } from "./gamemanager";
import { Scene } from "./scene";


/**
 * Main game scene that manages the blackjack table and game logic
 */
export class MainScene extends Scene 
{
    gameManager: GameManager;
    private _lastEventTime: number | null = null;
  private _lastEventType: string | null = null;

  constructor() {
    super(false);
    
    this.gameManager = new GameManager();
    this.addChildToFullScene(this.gameManager);
  }



  recievedMessage(msgType: string, msgParams: any): void {
    this.gameManager.recievedMessage(msgType, msgParams);
  }

  addToSceneCallBack(object : any) {
    this.addChildToFullScene(object);
  }


  public update(dt: number): void {
    // Update game logic if needed
  }

  public resize(): void {
    super.resize();
    this.gameManager.position.set(this.sceneContainer.position.x, this.sceneContainer.position.y);
    // this.gameManager.position.set(this.position.x, this.position.y);
    this.gameManager.resize();
  }
}
